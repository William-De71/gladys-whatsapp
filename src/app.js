// -----------------------------------------------------------------------------
// Every handler of the WhatsApp integration, registered on the Gladys client
// it receives: index.js passes the real one, the tests the fake Gladys of the
// SDK (`@gladysassistant/integration-sdk/testing`).
//
// WhatsApp is a COMMUNICATION integration of the BIDIRECTIONAL family
// (`messaging: { receive: true }`), on the official WhatsApp Business Cloud
// API of Meta:
//   - outgoing: onSendMessage(contact, message) -> a text (or an image) to the
//     linked WhatsApp number; outside the 24-hour customer service window, the
//     fallback template of the configuration, when there is one;
//   - incoming: Meta posts every message to its webhook, relayed by Gladys Plus
//     to the `meta` webhook of the manifest (sync mode: the GET verification of
//     Meta needs its challenge back). A link code generated in Gladys links the
//     sender; the messages of linked contacts go to the brain of Gladys
//     (publishMessage) and to the `message_received` scene trigger;
//   - without Gladys Plus there is no incoming path: the "Link a number"
//     button links a number by hand, and Gladys can only send (templates).
//
// The answer to Meta never waits for Gladys: the webhook handler answers 200
// at once and processes the notification afterwards (Meta retries what is not
// acknowledged within a few seconds, the store drops the duplicates).
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';

import {
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeConfig,
  isConfigured,
  readLanguage,
  readTemplateName,
  readTemplateLanguage,
  readPhoneNumber,
  maskNumber,
} from './config.js';
import {
  GRAPH_VERSION,
  WhatsAppError,
  createGraphApi,
  decodeImage,
  splitText,
  templateParameter,
  templateParameters,
  MAX_CAPTION_LENGTH,
} from './graph-api.js';
import { verifyChallenge, parseNotification } from './webhook.js';
import { createStore } from './store.js';
import { TRIGGERS, SCENE_ACTIONS, receivedEvent, createFailureEvents } from './events.js';
import { WIDGETS, buildStatusWidget, receptionOf, qualityKey, statusKey } from './widgets.js';
import { LANGUAGES, t, all } from './i18n.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const WEBHOOK_KEY = 'meta';
const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  REGISTER_WEBHOOK: 'register_webhook',
  LINK_NUMBER: 'link_number',
  DIAGNOSTIC: 'diagnostic',
};
// The customer service window of WhatsApp: 24 hours after the last message of
// the user. A margin keeps a message from leaving at the last second.
const SERVICE_WINDOW_MS = 24 * 3600 * 1000 - 5 * 60 * 1000;
// The phone number (name, quality, status, limit) is read again every 15 min.
const PHONE_REFRESH_MS = 15 * 60 * 1000;
const CONTACTS_TTL_MS = 60 * 1000;
// A sent message waits for its status this long (fallback on a late 131047).
const PENDING_TTL_MS = 24 * 3600 * 1000;
const MAX_PENDING = 500;
// The link codes of Gladys: 8 characters of an alphabet without 0/O, 1/I/L.
const LINK_CODE = /^[A-HJKMNP-Z2-9]{8}$/;
const MAX_MESSAGE = 200;

/**
 * @description Cut every language of a message to the 200 characters of the
 * Configuration screen.
 * @param {Record<string, string>} message - The message.
 * @returns {Record<string, string>} The message.
 */
const bounded = (message) =>
  Object.fromEntries(
    Object.entries(message).map(([language, text]) => [
      language,
      text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text,
    ]),
  );

/**
 * @description A link code sent in a message, if it is one.
 * @param {string|null} text - The text of the message.
 * @returns {string|null} The code, in capitals.
 * @example
 * linkCodeOf(' abcd2345 '); // -> 'ABCD2345'
 */
function linkCodeOf(text) {
  const code = String(text ?? '')
    .trim()
    .toUpperCase();
  return LINK_CODE.test(code) ? code : null;
}

/**
 * @description The host of an URL, without its secret path (logs).
 * @param {string} url - The URL.
 * @returns {string} 'https://host/…'.
 */
function hostOf(url) {
  try {
    return `${new URL(url).origin}/…`;
  } catch {
    return '?';
  }
}

/**
 * @description Register the handlers of the integration on a Gladys client.
 * @param {object} gladys - The GladysIntegration client (real or fake).
 * @param {object} [options] - Options (injected by the tests).
 * @param {typeof fetch} [options.fetchImpl] - fetch implementation.
 * @param {string} [options.statePath] - The state file.
 * @param {() => number} [options.now] - Clock.
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  { fetchImpl, statePath, now = () => Date.now(), logger = sdkLogger } = {},
) {
  let config = normalizeConfig();
  let api = null;
  // Language of the last widget request: the language of the replies sent
  // before a contact is linked, when the `language` setting is `auto`.
  let language = 'en';
  let phone = null;
  let phoneError = null;
  let lastError = null;
  let webhooks = { available: false, webhooks: [] };
  let contactsCache = { at: 0, list: [] };
  let lastStatus = null;
  let refreshTimer = null;
  let lastRegistered = null;
  // wamid -> { to, text, origin: 'message' | 'scene', at }
  const pending = new Map();
  // The notifications of Meta are processed one after the other, in order.
  let queue = Promise.resolve();

  const store = createStore({ logger, now, ...(statePath ? { path: statePath } : {}) });
  const failures = createFailureEvents(gladys, logger);

  const replyLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (!LANGUAGES.includes(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} [message] - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message ?? null]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message ? bounded(message) : undefined);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The message of the Configuration screen for an error.
   * @param {Error} err - The error.
   * @returns {object} The multi-language message.
   */
  function errorMessage(err) {
    if (err instanceof WhatsAppError && err.reason === 'auth') {
      return all('tokenInvalid');
    }
    if (err instanceof WhatsAppError && err.reason === 'permission') {
      return all('permissionDenied');
    }
    return all('apiError', { error: err.message });
  }

  // --- configuration ---------------------------------------------------------------

  /**
   * @description Read the configuration; generate the verify token when empty.
   * @param {object} [rawConfig] - The raw config (else fetched).
   * @returns {Promise<void>}
   */
  async function loadConfig(rawConfig) {
    let raw = rawConfig;
    if (!raw) {
      try {
        raw = await gladys.getConfig();
      } catch (err) {
        logger.error('Unable to read the configuration', err);
        raw = gladys.config ?? {};
      }
    }
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    if (!config.verifyToken) {
      // The token Meta sends back when it verifies the URL: random, shown in
      // the form so that the user can paste it in the Meta app.
      config.verifyToken = `gladys-${randomBytes(12).toString('hex')}`;
      try {
        await gladys.setConfig({ verify_token: config.verifyToken });
      } catch (err) {
        logger.warn(`Unable to store the verify token: ${err.message}`);
      }
    }
    api = isConfigured(config)
      ? createGraphApi({
          accessToken: config.accessToken,
          phoneNumberId: config.phoneNumberId,
          businessAccountId: config.businessAccountId,
          ...(fetchImpl ? { fetchImpl } : {}),
        })
      : null;
  }

  // --- the phone number --------------------------------------------------------------

  /**
   * @description Read the phone number at Meta, report the connection status
   * and refresh the widget when something changed.
   * @returns {Promise<boolean>} Whether the number could be read.
   */
  async function refreshPhone() {
    if (!api) {
      phone = null;
      phoneError = null;
      await reportStatus(false, all('notConfigured'));
      return false;
    }
    const before = JSON.stringify([phone, phoneError]);
    let ok = false;
    try {
      phone = await api.getPhoneNumber();
      phoneError = null;
      lastError = null;
      ok = true;
      await reportStatus(true);
    } catch (err) {
      phoneError = err.message;
      lastError = err;
      if (err instanceof WhatsAppError && ['auth', 'permission'].includes(err.reason)) {
        phone = null;
      }
      logger.warn(`Unable to read the WhatsApp phone number: ${err.message}`);
      await reportStatus(false, errorMessage(err));
    }
    if (JSON.stringify([phone, phoneError]) !== before) {
      requestRefresh();
    }
    return ok;
  }

  const requestRefresh = () =>
    Promise.resolve()
      .then(() => gladys.requestWidgetRefresh(WIDGETS.STATUS))
      .catch(() => {});

  // --- webhooks ------------------------------------------------------------------------

  const webhookUrl = () =>
    webhooks.webhooks?.find((entry) => entry.key === WEBHOOK_KEY)?.url ?? null;

  /**
   * @description Read the Gladys Plus webhook state.
   * @returns {Promise<void>}
   */
  async function loadWebhooks() {
    try {
      webhooks = (await gladys.getWebhooks()) ?? { available: false, webhooks: [] };
    } catch (err) {
      logger.warn(`Unable to read the Gladys Plus webhooks: ${err.message}`);
      webhooks = { available: false, webhooks: [] };
    }
  }

  /**
   * @description Point the webhook of the WhatsApp Business Account at the
   * Gladys Plus URL (subscribed_apps with an alternate callback URL).
   * @param {boolean} [force] - Register again even if the URL did not change.
   * @returns {Promise<string>} 'ok', 'no_plus', 'no_account', 'too_long',
   * 'not_configured', 'skipped' or 'failed:<message>'.
   */
  async function registerWebhook(force = false) {
    if (!api) {
      return 'not_configured';
    }
    const url = webhookUrl();
    if (!webhooks.available || !url) {
      return 'no_plus';
    }
    if (!config.businessAccountId) {
      return 'no_account';
    }
    if (url.length > 200) {
      return 'too_long';
    }
    const signature = `${url}|${config.verifyToken}|${config.businessAccountId}`;
    if (!force && signature === lastRegistered) {
      return 'skipped';
    }
    try {
      await api.registerWebhook(url, config.verifyToken);
      lastRegistered = signature;
      logger.info(`Webhook of the WhatsApp Business Account pointed at ${hostOf(url)}`);
      return 'ok';
    } catch (err) {
      logger.warn(`Meta refused the webhook registration: ${err.message}`);
      return `failed:${err.message}`;
    }
  }

  // --- contacts ------------------------------------------------------------------------

  /**
   * @description The linked contacts (cached a minute).
   * @param {boolean} [fresh] - Skip the cache.
   * @returns {Promise<object[]>} getContacts entries.
   */
  async function linkedContacts(fresh = false) {
    if (!fresh && now() - contactsCache.at < CONTACTS_TTL_MS) {
      return contactsCache.list;
    }
    try {
      const list = await gladys.getContacts();
      contactsCache = { at: now(), list: Array.isArray(list) ? list : [] };
    } catch (err) {
      logger.warn(`Unable to read the linked contacts: ${err.message}`);
    }
    return contactsCache.list;
  }

  // --- outgoing --------------------------------------------------------------------

  /**
   * @description Remember a sent message until its status arrives.
   * @param {string|null} id - The wamid.
   * @param {object} entry - `{ to, text, origin }`.
   */
  function track(id, entry) {
    if (!id) {
      return;
    }
    const limit = now() - PENDING_TTL_MS;
    for (const [key, value] of pending) {
      if (value.at < limit || pending.size >= MAX_PENDING) {
        pending.delete(key);
      }
    }
    pending.set(id, { ...entry, at: now() });
  }

  const windowOpen = (to) => {
    const last = store.lastInbound(to);
    return Number.isFinite(last) && now() - last < SERVICE_WINDOW_MS;
  };

  /**
   * @description Send a text through the fallback template.
   * @param {string} to - The recipient.
   * @param {string} text - The text.
   * @returns {Promise<{ id: string|null }>} The message.
   */
  async function sendFallback(to, text) {
    const sent = await api.sendTemplate(to, config.fallbackTemplate, config.fallbackLanguage, [
      { type: 'text', text: templateParameter(text) },
    ]);
    store.count('sent');
    track(sent.id, { to, text, origin: 'fallback' });
    logger.info(`Message to ${maskNumber(to)} sent with the template ${config.fallbackTemplate}`);
    return sent;
  }

  /**
   * @description Deliver a message of Gladys: free-form within the 24-hour
   * window, the fallback template outside of it.
   * @param {string} to - The recipient (digits).
   * @param {{ text: string, file: string|null }} message - The message.
   * @returns {Promise<void>}
   */
  async function deliver(to, message) {
    const text = String(message?.text ?? '');
    const image = decodeImage(message?.file);
    if (message?.file && !image) {
      logger.warn('The attached file is not a JPEG or PNG image under 5 MB: only the text is sent');
    }
    if (!text.trim() && !image) {
      throw new Error('Empty message');
    }
    if (config.fallbackTemplate && !windowOpen(to)) {
      // Outside the window, only a template reaches the user (no image).
      await sendFallback(to, text || '📷');
      return;
    }
    try {
      const parts = splitText(text);
      if (image) {
        const caption = parts.length === 1 && parts[0].length <= MAX_CAPTION_LENGTH ? parts[0] : '';
        const sent = await api.sendImage(to, image, caption);
        store.count('sent');
        track(sent.id, { to, text, origin: 'message' });
        if (caption) {
          parts.length = 0;
        }
      }
      for (const part of parts) {
        const sent = await api.sendText(to, part);
        store.count('sent');
        track(sent.id, { to, text: part, origin: 'message' });
      }
    } catch (err) {
      if (
        err instanceof WhatsAppError &&
        err.reason === 'outside_window' &&
        config.fallbackTemplate
      ) {
        await sendFallback(to, text);
        return;
      }
      throw err;
    }
  }

  /**
   * @description A message of Gladys could not be delivered.
   * @param {string} to - The recipient.
   * @param {Error} err - The failure.
   * @param {string|null} [messageId] - The wamid.
   * @returns {Promise<void>}
   */
  async function deliveryFailed(to, err, messageId = null) {
    store.count('failed');
    const reason = err instanceof WhatsAppError ? err.reason : 'other';
    logger.warn(`Message to ${maskNumber(to)} not delivered (${reason}): ${err.message}`);
    await failures.failed(to, { reason, code: err.code ?? null, message: err.message }, messageId);
    requestRefresh();
  }

  gladys.onSendMessage(async (contact, message) => {
    const to = readPhoneNumber(contact?.id);
    if (!to) {
      throw new Error('The contact has no WhatsApp number');
    }
    if (!api) {
      throw new Error('The WhatsApp integration is not configured');
    }
    logger.info(`onSendMessage -> delivering a message to ${maskNumber(to)}`);
    try {
      await deliver(to, message);
    } catch (err) {
      await deliveryFailed(to, err);
      throw err;
    }
    await store.save();
  });

  // --- incoming --------------------------------------------------------------------

  /**
   * @description Send a reply on WhatsApp, best effort (the window is open:
   * the user just wrote).
   * @param {string} to - The recipient.
   * @param {string} text - The text.
   * @returns {Promise<void>}
   */
  async function reply(to, text) {
    try {
      const sent = await api.sendText(to, text);
      store.count('sent');
      track(sent.id, { to, text, origin: 'reply' });
    } catch (err) {
      logger.warn(`Unable to reply to ${maskNumber(to)}: ${err.message}`);
    }
  }

  /**
   * @description Handle one received message.
   * @param {object} message - A message of parseNotification.
   * @returns {Promise<void>}
   */
  async function receive(message) {
    if (!store.remember(message.id)) {
      logger.debug(`Message ${message.id} already received, dropped`);
      return;
    }
    const at = message.at ?? now();
    store.inboundFrom(message.from, at);
    store.count('received');
    const who = maskNumber(message.from);

    const code = message.type === 'text' ? linkCodeOf(message.text) : null;
    if (code) {
      try {
        const user = await gladys.linkContact(code, message.from, message.name ?? undefined);
        contactsCache = { at: 0, list: [] };
        logger.info(`WhatsApp ${who} linked to the Gladys user ${user?.selector ?? '?'}`);
        await reply(
          message.from,
          t('linkOk', user?.language ?? replyLanguage(), { name: user?.first_name ?? '' }),
        );
      } catch (err) {
        logger.warn(`Link code from ${who} refused: ${err.message}`);
        await reply(message.from, t('linkInvalid', replyLanguage()));
      }
      return;
    }

    const contact = (await linkedContacts()).find((entry) => entry.contact_id === message.from);
    if (!contact) {
      // Strangers get no answer: the number is a private assistant.
      logger.info(`Message from ${who}, a number not linked to Gladys: ignored`);
      return;
    }
    if (config.markAsRead) {
      api.markAsRead(message.id).catch((err) => logger.debug(`Read receipt: ${err.message}`));
    }
    if (message.text) {
      try {
        await gladys.publishMessage(message.from, message.text.slice(0, 4096), {
          createdAt: new Date(at),
        });
      } catch (err) {
        logger.warn(`Gladys refused the message of ${who}: ${err.message}`);
        contactsCache = { at: 0, list: [] };
      }
    } else if (message.type !== 'reaction') {
      await reply(
        message.from,
        t(
          'unsupported',
          LANGUAGES.includes(contact.user?.language) ? contact.user.language : replyLanguage(),
        ),
      );
    }
    try {
      await gladys.publishSceneEvent(TRIGGERS.MESSAGE_RECEIVED, receivedEvent(message, contact));
    } catch (err) {
      logger.warn(`Unable to publish the message_received event: ${err.message}`);
    }
  }

  /**
   * @description Handle the status of a sent message.
   * @param {object} status - A status of parseNotification.
   * @returns {Promise<void>}
   */
  async function statusOf(status) {
    const entry = pending.get(status.id);
    const to = status.recipient || entry?.to;
    if (['sent', 'delivered', 'read'].includes(status.status)) {
      if (to) {
        failures.delivered(to);
      }
      if (status.status === 'read') {
        pending.delete(status.id);
      }
      return;
    }
    if (status.status !== 'failed' || !to) {
      return;
    }
    pending.delete(status.id);
    const err = new WhatsAppError(
      `${status.error?.title ?? 'Message failed'}${status.error?.code ? ` (#${status.error.code})` : ''}`,
      { code: status.error?.code ?? null, details: status.error?.details ?? null },
    );
    // Meta accepted the message, then found the window closed: resend it
    // through the fallback template, once.
    if (
      entry?.origin === 'message' &&
      err.reason === 'outside_window' &&
      config.fallbackTemplate &&
      api
    ) {
      try {
        await sendFallback(to, entry.text);
        return;
      } catch (fallbackError) {
        await deliveryFailed(to, fallbackError, status.id);
        return;
      }
    }
    if (entry?.origin === 'scene') {
      // No scene event caused by a scene action.
      store.count('failed');
      logger.warn(`Template sent by a scene to ${maskNumber(to)} not delivered: ${err.message}`);
      return;
    }
    await deliveryFailed(to, err, status.id);
  }

  /**
   * @description Process a notification of Meta (after the 200).
   * @param {string|null} body - The raw body.
   * @returns {Promise<void>}
   */
  async function processNotification(body) {
    const { messages, statuses } = parseNotification(body);
    if (messages.length === 0 && statuses.length === 0) {
      return;
    }
    store.webhookReceived(now());
    for (const message of messages) {
      if (
        config.phoneNumberId &&
        message.phoneNumberId &&
        message.phoneNumberId !== config.phoneNumberId
      ) {
        logger.debug('Message for another phone number of the account: ignored');
        continue;
      }
      if (!api) {
        logger.warn('Message received while the integration is not configured: ignored');
        continue;
      }
      await receive(message);
    }
    for (const status of statuses) {
      if (
        config.phoneNumberId &&
        status.phoneNumberId &&
        status.phoneNumberId !== config.phoneNumberId
      ) {
        continue;
      }
      await statusOf(status);
    }
    await store.save();
  }

  gladys.onWebhook(WEBHOOK_KEY, async ({ method, query, body }) => {
    if (String(method).toUpperCase() === 'GET') {
      const response = verifyChallenge(query, config.verifyToken);
      logger.info(
        response.status === 200
          ? 'Meta verified the webhook URL'
          : 'Webhook verification refused (wrong verify token)',
      );
      return response;
    }
    queue = queue
      .then(() => processNotification(body))
      .catch((err) => logger.error('Unable to process a notification of Meta', err));
    return { status: 200, contentType: 'text/plain', body: 'OK' };
  });

  gladys.onWebhookUpdated(async (info) => {
    webhooks = info ?? { available: false, webhooks: [] };
    logger.info(`Gladys Plus webhooks ${webhooks.available ? 'available' : 'unavailable'}`);
    if (config.registerWebhook) {
      await registerWebhook();
    }
    requestRefresh();
  });

  // --- scene action ------------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.SEND_TEMPLATE, async (fields) => {
    if (!api) {
      throw new Error('The WhatsApp integration is not configured');
    }
    const template = readTemplateName(fields?.template);
    if (!template) {
      throw new Error('Invalid template name (lowercase letters, digits and underscores)');
    }
    const templateLanguage = readTemplateLanguage(fields?.language, config.fallbackLanguage);
    const parameters = templateParameters(fields?.parameters ?? '');
    let recipients;
    if (String(fields?.to ?? '').trim()) {
      const to = readPhoneNumber(fields.to);
      if (!to) {
        throw new Error('Invalid recipient: an international number, e.g. +33612345678');
      }
      recipients = [to];
    } else {
      recipients = (await linkedContacts(true))
        .map((entry) => readPhoneNumber(entry.contact_id))
        .filter(Boolean);
      if (recipients.length === 0) {
        throw new Error('No recipient: no WhatsApp contact is linked yet');
      }
    }
    let first = null;
    for (const to of recipients) {
      const sent = await api.sendTemplate(to, template, templateLanguage, parameters);
      store.count('sent');
      track(sent.id, { to, text: template, origin: 'scene' });
      first = first ?? sent;
    }
    await store.save();
    logger.info(`Template ${template} sent to ${recipients.length} recipient(s)`);
    return { message_id: first?.id ?? '', wa_id: first?.waId ?? '', sent: recipients.length };
  });

  // --- widget --------------------------------------------------------------------------

  gladys.onWidgetGet(WIDGETS.STATUS, async ({ language: lang } = {}) => {
    rememberLanguage(lang);
    const contacts = api ? (await linkedContacts()).length : 0;
    return buildStatusWidget({
      phone,
      configured: Boolean(api),
      error: phoneError,
      counters: store.counters(),
      webhooksAvailable: Boolean(webhooks.available),
      webhookAt: store.webhookAt(),
      contacts,
      language: LANGUAGES.includes(lang) ? lang : 'en',
      now: now(),
    });
  });

  // --- Configuration screen actions --------------------------------------------------

  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!api) {
      return bounded(all('notConfigured'));
    }
    await loadWebhooks();
    if (!(await refreshPhone())) {
      return bounded(lastError ? errorMessage(lastError) : all('notConfigured'));
    }
    const reception = receptionOf(Boolean(webhooks.available), store.webhookAt());
    return bounded(
      all('testOk', (l) => ({
        name: phone.verified_name ?? '?',
        number: phone.display_phone_number ?? '?',
        quality: t(`quality_${qualityKey(phone)}`, l),
        status: t(`status_${statusKey(phone)}`, l),
        reception: t(`reception_${reception}`, l),
      })),
    );
  });

  gladys.onAction(ACTIONS.REGISTER_WEBHOOK, async () => {
    if (!api) {
      return bounded(all('notConfigured'));
    }
    await loadWebhooks();
    const result = await registerWebhook(true);
    if (result === 'ok') {
      return bounded(all('registerOk'));
    }
    if (result === 'no_plus') {
      return bounded(all('registerNoPlus'));
    }
    if (result === 'no_account') {
      return bounded(all('registerNoAccount'));
    }
    if (result === 'too_long') {
      return bounded(all('registerTooLong'));
    }
    return bounded(all('registerFailed', { error: result.replace(/^failed:/, '') }));
  });

  gladys.onAction(ACTIONS.LINK_NUMBER, async (fields) => {
    const number = readPhoneNumber(fields?.phone_number);
    const code = linkCodeOf(fields?.code);
    if (!number || !code) {
      return bounded(all('linkNumberInvalid'));
    }
    try {
      const user = await gladys.linkContact(code, number);
      contactsCache = { at: 0, list: [] };
      logger.info(`WhatsApp ${maskNumber(number)} linked by hand to ${user?.selector ?? '?'}`);
      return bounded(all('linkNumberOk', { number: `+${number}`, name: user?.first_name ?? '?' }));
    } catch (err) {
      logger.warn(`Link code refused: ${err.message}`);
      return bounded(all('linkNumberExpired'));
    }
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const line = (part, value) =>
      logger.info(`WhatsApp diagnostic ${part}: ${JSON.stringify(value)}`);
    await loadWebhooks();
    line('integration', {
      version,
      graph: GRAPH_VERSION,
      configured: Boolean(api),
      business_account_id: Boolean(config.businessAccountId),
      register_webhook: config.registerWebhook,
      fallback_template: config.fallbackTemplate || null,
      fallback_language: config.fallbackLanguage,
      mark_as_read: config.markAsRead,
    });
    if (api) {
      try {
        const info = await api.getPhoneNumber();
        line('phone', {
          verified_name: info.verified_name,
          display_phone_number: maskNumber(
            String(info.display_phone_number ?? '').replace(/\D/g, ''),
          ),
          quality_rating: info.quality_rating,
          status: info.status,
          messaging_limit: info.whatsapp_business_manager_messaging_limit,
        });
      } catch (err) {
        line('phone', { error: err.message, reason: err.reason });
      }
    }
    const url = webhookUrl();
    line('webhooks', {
      available: Boolean(webhooks.available),
      url: url ? hostOf(url) : null,
      url_length: url?.length ?? null,
      last_event: store.webhookAt() ? new Date(store.webhookAt()).toISOString() : null,
    });
    if (api && config.businessAccountId) {
      try {
        const apps = await api.subscribedApps();
        line(
          'subscribed_apps',
          apps.map((app) => ({
            app: app.whatsapp_business_api_data?.name ?? null,
            override: app.override_callback_uri ? hostOf(app.override_callback_uri) : null,
            points_at_gladys: Boolean(url && app.override_callback_uri === url),
          })),
        );
      } catch (err) {
        line('subscribed_apps', { error: err.message });
      }
      try {
        const templates = await api.listTemplates();
        line(
          'templates',
          templates.map(({ name, language: lang, status, category }) => ({
            name,
            language: lang,
            status,
            category,
          })),
        );
      } catch (err) {
        line('templates', { error: err.message });
      }
    }
    const contacts = await linkedContacts(true);
    line(
      'contacts',
      contacts.map((entry) => {
        const last = store.lastInbound(entry.contact_id);
        return {
          number: maskNumber(entry.contact_id),
          linked_user: Boolean(entry.user),
          window_open: windowOpen(entry.contact_id),
          last_message_hours: last ? Math.round((now() - last) / 360000) / 10 : null,
        };
      }),
    );
    line('today', store.counters());
    return bounded(all('diagnosticDone'));
  });

  // --- lifecycle -------------------------------------------------------------------------

  /**
   * @description Everything that follows a (new) configuration.
   * @returns {Promise<void>}
   */
  async function start() {
    await loadWebhooks();
    await refreshPhone();
    if (api && config.registerWebhook) {
      await registerWebhook();
    }
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      refreshPhone().catch((err) => logger.error('Phone number refresh failed', err));
    }, PHONE_REFRESH_MS);
    refreshTimer.unref?.();
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    await loadConfig(rawConfig);
    lastRegistered = null;
    contactsCache = { at: 0, list: [] };
    logger.info(`Configuration updated (${api ? 'configured' : 'not configured'})`);
    await start();
  });

  // Resolves once the post-connection initialization is done (tests, shutdown).
  let started = Promise.resolve();
  gladys.on('connected', () => {
    started = (async () => {
      try {
        await store.load();
        await loadConfig();
        lastStatus = null;
        await start();
      } catch (err) {
        logger.error('Post-connection initialization failed', err);
      }
    })();
    return started;
  });

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    clearInterval(refreshTimer);
    await started;
    await queue;
    await store.save();
  });

  return {
    store,
    pending,
    getConfig: () => config,
    idle: () => queue,
    ready: () => started,
    refreshPhone,
    registerWebhook,
  };
}

export { createApp, ACTIONS, WEBHOOK_KEY, SERVICE_WINDOW_MS, linkCodeOf };
