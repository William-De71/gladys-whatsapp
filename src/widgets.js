// -----------------------------------------------------------------------------
// Dashboard widget of the WhatsApp integration.
//
//   - `status`  the business phone number at a glance: its verified name and
//               number, the quality rating and the messaging limit Meta gives
//               it, the messages sent, received and failed today, its status
//               at Meta, whether the reception through Gladys Plus works, the
//               last event of Meta and the linked contacts.
//
// The content comes from the last reading of the phone number (every 15
// minutes) and from the counters of the integration: a widget never costs a
// Cloud API call. Every text exists in the four languages (the content is
// cached per language). Content budget of a card: 8 components, 6 tiles, 2
// texts, 1 status.
// -----------------------------------------------------------------------------

import { t, ago } from './i18n.js';

const WIDGETS = { STATUS: 'status' };
const TTL = 60;

const QUALITY_COLORS = { GREEN: 'success', YELLOW: 'warning', RED: 'danger' };
const STATUS_COLORS = {
  CONNECTED: 'success',
  PENDING: 'warning',
  FLAGGED: 'warning',
  RATE_LIMITED: 'warning',
  RESTRICTED: 'danger',
  DISCONNECTED: 'danger',
};
const RECEPTION_COLORS = { active: 'success', waiting: 'warning', off: 'neutral' };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @returns {object} The content.
 * @example
 * messageContent('Not configured');
 */
function messageContent(message) {
  return {
    ttl_seconds: TTL,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The messaging limit of Meta, readable: TIER_250 -> 250,
 * TIER_10K -> 10K, TIER_UNLIMITED -> Unlimited.
 * @param {string|null} tier - whatsapp_business_manager_messaging_limit.
 * @param {string} language - The language.
 * @returns {string} The value (12 characters at most).
 * @example
 * formatLimit('TIER_2K', 'en'); // -> '2K'
 */
function formatLimit(tier, language) {
  if (typeof tier !== 'string' || !tier) {
    return '?';
  }
  const value = tier.replace(/^TIER_/, '');
  if (value === 'UNLIMITED') {
    return t('limit_unlimited', language);
  }
  return clip(value, 12);
}

/**
 * @description The key of the quality rating: GREEN, YELLOW, RED or unknown.
 * @param {object|null} phone - The phone number.
 * @returns {string} The key.
 */
const qualityKey = (phone) =>
  QUALITY_COLORS[phone?.quality_rating] ? phone.quality_rating : 'unknown';

/**
 * @description The key of the status of the number at Meta, or unknown.
 * @param {object|null} phone - The phone number.
 * @returns {string} The key.
 */
const statusKey = (phone) => (STATUS_COLORS[phone?.status] ? phone.status : 'unknown');

/**
 * @description The reception state: `active` once Meta delivered a webhook,
 * `waiting` while Gladys Plus is ready but nothing came yet, `off` without
 * Gladys Plus.
 * @param {boolean} available - Gladys Plus webhooks available.
 * @param {number|null} webhookAt - The last webhook, in ms.
 * @returns {'active'|'waiting'|'off'} The state.
 */
function receptionOf(available, webhookAt) {
  if (!available) {
    return 'off';
  }
  return Number.isFinite(webhookAt) ? 'active' : 'waiting';
}

/**
 * @description The `status` widget.
 * @param {object} options - Options.
 * @param {object|null} options.phone - The phone number read from Meta.
 * @param {boolean} options.configured - Whether the integration is configured.
 * @param {string|null} [options.error] - The last error reading the number.
 * @param {{ sent: number, received: number, failed: number }} options.counters - Today.
 * @param {boolean} options.webhooksAvailable - Gladys Plus webhooks available.
 * @param {number|null} options.webhookAt - The last webhook of Meta, in ms.
 * @param {number} options.contacts - The linked contacts.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @returns {object} The content.
 * @example
 * buildStatusWidget({ phone, configured: true, counters, webhooksAvailable: true,
 *   webhookAt: Date.now(), contacts: 2, language: 'en', now: Date.now() });
 */
function buildStatusWidget({
  phone,
  configured,
  error = null,
  counters,
  webhooksAvailable,
  webhookAt,
  contacts,
  language,
  now,
}) {
  if (!configured) {
    return messageContent(t('widgetNotConfigured', language));
  }
  if (!phone) {
    return messageContent(
      error ? t('apiError', language, { error }) : t('widgetNotRead', language),
    );
  }
  const quality = qualityKey(phone);
  const status = statusKey(phone);
  const reception = receptionOf(webhooksAvailable, webhookAt);
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: clip(phone.verified_name || phone.display_phone_number || 'WhatsApp', 40),
    },
    { type: 'text', variant: 'caption', text: t('captionToday', language) },
    {
      type: 'value',
      value: t(`quality_${quality}`, language),
      label: t('tileQuality', language),
      icon: 'award',
      color: QUALITY_COLORS[quality] ?? 'neutral',
    },
    {
      type: 'value',
      value: formatLimit(phone.whatsapp_business_manager_messaging_limit, language),
      label: t('tileLimit', language),
      icon: 'users',
      color: 'neutral',
    },
    {
      type: 'value',
      value: counters.sent,
      label: t('tileSent', language),
      icon: 'send',
      color: 'primary',
    },
    {
      type: 'value',
      value: counters.received,
      label: t('tileReceived', language),
      icon: 'message-circle',
      color: 'info',
    },
    {
      type: 'value',
      value: counters.failed,
      label: t('tileFailed', language),
      icon: 'alert-triangle',
      color: counters.failed > 0 ? 'danger' : 'neutral',
    },
    {
      type: 'status',
      items: [
        {
          label: t('rowNumber', language),
          value: clip(
            phone.display_phone_number
              ? `${phone.display_phone_number} · ${t(`status_${status}`, language)}`
              : t(`status_${status}`, language),
            40,
          ),
          color: STATUS_COLORS[status] ?? 'neutral',
        },
        {
          label: t('rowReception', language),
          value: clip(t(`reception_${reception}`, language), 40),
          color: RECEPTION_COLORS[reception],
        },
        {
          label: t('rowLastWebhook', language),
          value: clip(ago(webhookAt, now, language), 40),
          color: 'neutral',
        },
        {
          label: t('rowContacts', language),
          value: contacts,
          color: contacts > 0 ? 'success' : 'warning',
        },
      ],
    },
  ];
  return { ttl_seconds: TTL, components };
}

export {
  WIDGETS,
  buildStatusWidget,
  formatLimit,
  receptionOf,
  qualityKey,
  statusKey,
  messageContent,
};
