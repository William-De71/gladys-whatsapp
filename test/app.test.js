import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, ACTIONS, WEBHOOK_KEY, linkCodeOf, SERVICE_WINDOW_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS, SCENE_ACTIONS } from '../src/events.js';
import { LANGUAGES } from '../src/i18n.js';
import {
  NOW,
  PHONE_NUMBER_ID,
  WABA_ID,
  TOKEN,
  ALICE,
  BOB,
  STRANGER,
  WEBHOOK_URL,
  CONFIG,
  silent,
  statePath,
  graphError,
  fakeGraph,
  textNotification,
  statusNotification,
  notification,
  linked,
} from './helpers/fixtures.js';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PLUS = { available: true, webhooks: [{ key: WEBHOOK_KEY, mode: 'sync', url: WEBHOOK_URL }] };

/**
 * @description The integration, connected to a fake Gladys and a fake Cloud API.
 * @param {object} [options] - Options.
 * @returns {Promise<object>} `{ gladys, app, graph, clock, logs }`.
 */
async function startApp({
  config = CONFIG,
  routes = {},
  contacts = [],
  webhooks = { available: false, webhooks: [] },
  linkedUser = { selector: 'alice', first_name: 'Alice', language: 'fr' },
  path = statePath(),
} = {}) {
  const clock = { now: NOW };
  const logs = [];
  const logger = {
    ...silent,
    info: (line) => logs.push(String(line)),
    warn: (line) => logs.push(String(line)),
  };
  const gladys = createFakeGladys({ config, contacts, webhooks, linkedUser });
  const graph = fakeGraph(routes);
  const app = createApp(gladys, {
    fetchImpl: graph.fetchImpl,
    statePath: path,
    now: () => clock.now,
    logger,
  });
  await gladys.connect();
  await app.ready();
  return { gladys, app, graph, clock, logs, path };
}

/**
 * @description Meta posts a notification: the 200 comes first, the processing after.
 * @param {object} context - startApp.
 * @param {string} body - The raw body.
 * @returns {Promise<object>} The ack of the webhook.
 */
async function post({ gladys, app }, body) {
  const ack = await gladys.fake.webhook(
    WEBHOOK_KEY,
    { method: 'POST', body, contentType: 'application/json' },
    { mode: 'sync' },
  );
  await app.idle();
  return ack;
}

const sent = (graph, type) =>
  graph.calls.filter(
    (call) => call.path === `${PHONE_NUMBER_ID}/messages` && call.json?.type === type,
  );
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('connects: reads the phone number and reports the connection', async () => {
  const { gladys, graph } = await startApp();
  assert.equal(graph.calls[0].path, PHONE_NUMBER_ID);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  // No Gladys Plus: nothing to register at Meta.
  assert.ok(!graph.calls.some((call) => call.path.endsWith('subscribed_apps')));
});

test('generates the verify token when empty, and stores it in the configuration', async () => {
  const { gladys, app } = await startApp({ config: { ...CONFIG, verify_token: '' } });
  const token = app.getConfig().verifyToken;
  assert.match(token, /^gladys-[0-9a-f]{24}$/);
  assert.equal(gladys.fake.config.verify_token, token);
});

test('not configured, or a token refused: a clear status in the Configuration screen', async () => {
  const empty = await startApp({ config: {} });
  assert.equal(empty.gladys.fake.connectionStatus.connected, false);
  assert.match(empty.gladys.fake.connectionStatus.message.en, /phone number ID/);
  assert.equal(empty.graph.calls.length, 0);

  const refused = await startApp({
    routes: {
      [`GET ${PHONE_NUMBER_ID}`]: {
        status: 401,
        body: graphError(190, 'Error validating access token'),
      },
    },
  });
  const status = refused.gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.deepEqual(Object.keys(status.message).sort(), [...LANGUAGES].sort());
  assert.match(status.message.fr, /jeton d'accès/);
  for (const text of Object.values(status.message)) {
    assert.ok(text.length <= 200);
  }
});

test('answers the verification GET of Meta with the challenge, plain text', async () => {
  const { gladys } = await startApp();
  const query = {
    'hub.mode': 'subscribe',
    'hub.verify_token': 'gladys-verify',
    'hub.challenge': '42',
  };
  const ack = await gladys.fake.webhook(WEBHOOK_KEY, { method: 'GET', query }, { mode: 'sync' });
  assert.equal(ack.success, true);
  assert.equal(ack.data.status, 200);
  assert.equal(ack.data.body, '42');
  const wrong = await gladys.fake.webhook(
    WEBHOOK_KEY,
    { method: 'GET', query: { ...query, 'hub.verify_token': 'nope' } },
    { mode: 'sync' },
  );
  assert.equal(wrong.data.status, 403);
});

test('a link code sent on WhatsApp links the sender, and Gladys answers in their language', async () => {
  const context = await startApp();
  const ack = await post(context, textNotification(STRANGER, ' abcd2345 '));
  assert.equal(ack.data.status, 200);
  const link = context.gladys.fake.bodies('POST', '/contact/link');
  assert.equal(link.length, 1);
  assert.equal(link[0].code, 'ABCD2345');
  assert.equal(link[0].contact_id, STRANGER);
  const replies = sent(context.graph, 'text');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].json.to, STRANGER);
  assert.match(
    replies[0].json.text.body,
    /^Bonjour Alice, votre WhatsApp est maintenant lié à Gladys/,
  );
  // A link code is never a message for the brain.
  assert.equal(context.gladys.fake.messages.length, 0);
  assert.equal(linkCodeOf('ABCD 2345'), null);
  assert.equal(linkCodeOf('ABCDO123'), null, 'O, 0 and 1 are not in the alphabet');
});

test('a refused link code gets the "invalid or expired" reply', async () => {
  const context = await startApp({ config: { ...CONFIG, language: 'es' } });
  context.gladys.linkContact = async () => {
    throw Object.assign(new Error('Not found'), { status: 404 });
  };
  await post(context, textNotification(STRANGER, 'ABCD2345'));
  assert.match(sent(context.graph, 'text')[0].json.text.body, /^Este código de vinculación/);
});

test('the messages of a linked contact reach Gladys, once, with blue ticks and a scene event', async () => {
  const context = await startApp({ contacts: [linked(ALICE)] });
  await post(context, textNotification(ALICE, 'Allume le salon', { id: 'wamid.in1' }));
  await post(context, textNotification(ALICE, 'Allume le salon', { id: 'wamid.in1' }));
  assert.deepEqual(
    context.gladys.fake.messages.map(({ contact_id: id, text }) => [id, text]),
    [[ALICE, 'Allume le salon']],
  );
  assert.equal(
    context.gladys.fake.messages[0].created_at,
    new Date(Math.floor(NOW / 1000) * 1000).toISOString(),
  );
  const read = context.graph.calls.filter((call) => call.json?.status === 'read');
  assert.equal(read.length, 1);
  assert.equal(read[0].json.message_id, 'wamid.in1');
  const events = eventsOf(context.gladys, TRIGGERS.MESSAGE_RECEIVED);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.from, ALICE);
  assert.equal(events[0].data.user, 'Alice');
  assert.equal(events[0].data.message_type, 'text');
  assert.equal(events[0].data.text, 'Allume le salon');
  assert.equal(context.app.store.counters().received, 1);
});

test('a stranger gets no answer, and nothing reaches Gladys', async () => {
  const context = await startApp({ contacts: [linked(ALICE)] });
  await post(context, textNotification(STRANGER, 'Hello?'));
  assert.equal(context.gladys.fake.messages.length, 0);
  assert.equal(sent(context.graph, 'text').length, 0);
  assert.equal(context.gladys.fake.sceneEvents.length, 0);
});

test('a voice note gets the "text only" reply; the scene event still fires', async () => {
  const context = await startApp({ contacts: [linked(ALICE, 'Alice', 'de')] });
  await post(
    context,
    notification({
      contacts: [{ profile: { name: 'Alice' }, wa_id: ALICE }],
      messages: [
        {
          from: ALICE,
          id: 'wamid.voice',
          timestamp: '1792000000',
          type: 'audio',
          audio: { id: 'm' },
        },
      ],
    }),
  );
  assert.match(
    sent(context.graph, 'text')[0].json.text.body,
    /^Gladys liest vorerst nur Textnachrichten/,
  );
  assert.equal(eventsOf(context.gladys, TRIGGERS.MESSAGE_RECEIVED)[0].data.message_type, 'audio');
  assert.equal(context.gladys.fake.messages.length, 0);
});

test('a message for another phone number of the account is ignored', async () => {
  const context = await startApp({ contacts: [linked(ALICE)] });
  const body = JSON.parse(textNotification(ALICE, 'Hi'));
  body.entry[0].changes[0].value.metadata.phone_number_id = '999999999999';
  await post(context, JSON.stringify(body));
  assert.equal(context.gladys.fake.messages.length, 0);
});

test('Gladys answers within the 24-hour window with free text', async () => {
  const context = await startApp({
    config: {
      ...CONFIG,
      fallback_template: 'gladys_notification',
      fallback_template_language: 'fr',
    },
    contacts: [linked(ALICE)],
  });
  await post(context, textNotification(ALICE, 'Quelle température ?'));
  const ack = await context.gladys.fake.sendMessage(
    { id: ALICE },
    { text: 'Il fait 21 °C.', file: null },
  );
  assert.equal(ack.success, true);
  const texts = sent(context.graph, 'text');
  assert.equal(texts.at(-1).json.text.body, 'Il fait 21 °C.');
  assert.equal(sent(context.graph, 'template').length, 0);
});

test('outside the window, the fallback template carries the text (no new line)', async () => {
  const context = await startApp({
    config: {
      ...CONFIG,
      fallback_template: 'gladys_notification',
      fallback_template_language: 'fr',
    },
    contacts: [linked(ALICE)],
  });
  await post(context, textNotification(ALICE, 'Bonjour'));
  context.clock.now += SERVICE_WINDOW_MS + 1000;
  await context.gladys.fake.sendMessage(
    { id: ALICE },
    { text: 'Porte ouverte\nCuisine', file: null },
  );
  const templates = sent(context.graph, 'template');
  assert.equal(templates.length, 1);
  assert.deepEqual(templates[0].json.template, {
    name: 'gladys_notification',
    language: { code: 'fr' },
    components: [{ type: 'body', parameters: [{ type: 'text', text: 'Porte ouverte · Cuisine' }] }],
  });
});

test('a 131047 refusal at send time falls back to the template', async () => {
  let calls = 0;
  const context = await startApp({
    config: { ...CONFIG, fallback_template: 'gladys_notification' },
    routes: {
      [`POST ${PHONE_NUMBER_ID}/messages`]: (request) => {
        calls += 1;
        return request.json.type === 'text'
          ? { status: 400, body: graphError(131047, 'Re-engagement message') }
          : { messages: [{ id: `wamid.t${calls}` }], contacts: [{ wa_id: ALICE }] };
      },
    },
  });
  // The window is unknown (no message stored): free text is tried first.
  context.app.store.inboundFrom(ALICE, NOW - 1000);
  const ack = await context.gladys.fake.sendMessage({ id: ALICE }, { text: 'Alarme', file: null });
  assert.equal(ack.success, true);
  assert.equal(sent(context.graph, 'template')[0].json.template.name, 'gladys_notification');
  assert.equal(sent(context.graph, 'template')[0].json.template.language.code, 'en_US');
});

test('a late 131047 status falls back to the template; without one, message_failed fires once', async () => {
  const withFallback = await startApp({
    config: { ...CONFIG, fallback_template: 'gladys_notification' },
    contacts: [linked(ALICE)],
  });
  withFallback.app.store.inboundFrom(ALICE, NOW - 1000);
  await withFallback.gladys.fake.sendMessage({ id: ALICE }, { text: 'Fuite détectée', file: null });
  const id = withFallback.graph.calls.at(-1).json && 'wamid.out1';
  await post(
    withFallback,
    statusNotification(id, 'failed', ALICE, { code: 131047, title: 'Re-engagement message' }),
  );
  assert.equal(
    sent(withFallback.graph, 'template')[0].json.template.components[0].parameters[0].text,
    'Fuite détectée',
  );
  assert.equal(eventsOf(withFallback.gladys, TRIGGERS.MESSAGE_FAILED).length, 0);

  const without = await startApp({ contacts: [linked(ALICE)] });
  without.app.store.inboundFrom(ALICE, NOW - 1000);
  await without.gladys.fake.sendMessage({ id: ALICE }, { text: 'One', file: null });
  await without.gladys.fake.sendMessage({ id: ALICE }, { text: 'Two', file: null });
  const failure = { code: 131026, title: 'Message undeliverable' };
  await post(without, statusNotification('wamid.out1', 'failed', ALICE, failure));
  await post(without, statusNotification('wamid.out2', 'failed', ALICE, failure));
  const events = eventsOf(without.gladys, TRIGGERS.MESSAGE_FAILED);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    to: ALICE,
    reason: 'undeliverable',
    error_code: 131026,
    error_title: 'Message undeliverable (#131026)',
    message_id: 'wamid.out1',
  });
  assert.equal(without.app.store.counters().failed, 2);
  // A message that goes through re-arms the trigger.
  await post(without, statusNotification('wamid.out3', 'delivered', ALICE));
  await post(without, statusNotification('wamid.out4', 'failed', ALICE, failure));
  assert.equal(eventsOf(without.gladys, TRIGGERS.MESSAGE_FAILED).length, 2);
});

test('a send refused at once fails the command and fires message_failed', async () => {
  const context = await startApp({
    routes: {
      [`POST ${PHONE_NUMBER_ID}/messages`]: {
        status: 400,
        body: graphError(131030, 'Recipient phone number not in allowed list'),
      },
    },
  });
  context.app.store.inboundFrom(ALICE, NOW - 1000);
  const ack = await context.gladys.fake.sendMessage({ id: ALICE }, { text: 'Hi', file: null });
  assert.equal(ack.success, false);
  assert.match(ack.error, /allowed list/);
  assert.equal(eventsOf(context.gladys, TRIGGERS.MESSAGE_FAILED)[0].data.reason, 'not_allowed');
});

test('an image is uploaded and sent with the text as caption', async () => {
  const context = await startApp();
  context.app.store.inboundFrom(ALICE, NOW - 1000);
  await context.gladys.fake.sendMessage({ id: ALICE }, { text: 'Sonnette', file: PNG_BASE64 });
  assert.ok(context.graph.calls.some((call) => call.path === `${PHONE_NUMBER_ID}/media`));
  const images = sent(context.graph, 'image');
  assert.equal(images[0].json.image.caption, 'Sonnette');
  assert.equal(sent(context.graph, 'text').length, 0);
  // Not an image: the text alone.
  await context.gladys.fake.sendMessage({ id: ALICE }, { text: 'Texte', file: 'bm90IGFuIGltYWdl' });
  assert.equal(sent(context.graph, 'text')[0].json.text.body, 'Texte');
});

test('send_template: to a number or to every linked contact, declared outputs only', async () => {
  const context = await startApp({ contacts: [linked(ALICE), linked(BOB, 'Bob', 'de')] });
  const one = await context.gladys.fake.sceneAction(SCENE_ACTIONS.SEND_TEMPLATE, {
    to: '+33 6 12 34 56 78',
    template: 'door_open_alert',
    language: 'fr',
    parameters: 'Cuisine|21,5 °C',
  });
  assert.equal(one.success, true);
  assert.deepEqual(Object.keys(one.data.outputs).sort(), ['message_id', 'sent', 'wa_id']);
  assert.equal(one.data.outputs.sent, 1);
  assert.equal(one.data.outputs.wa_id, ALICE);
  const first = sent(context.graph, 'template')[0].json;
  assert.equal(first.to, ALICE);
  assert.deepEqual(first.template.components[0].parameters, [
    { type: 'text', text: 'Cuisine' },
    { type: 'text', text: '21,5 °C' },
  ]);
  const everyone = await context.gladys.fake.sceneAction(SCENE_ACTIONS.SEND_TEMPLATE, {
    template: 'hello_world',
  });
  assert.equal(everyone.data.outputs.sent, 2);
  assert.equal(sent(context.graph, 'template')[2].json.template.language.code, 'en_US');
  const bad = await context.gladys.fake.sceneAction(SCENE_ACTIONS.SEND_TEMPLATE, {
    template: 'Not A Name',
  });
  assert.equal(bad.success, false);
  const noOne = await startApp();
  const empty = await noOne.gladys.fake.sceneAction(SCENE_ACTIONS.SEND_TEMPLATE, { template: 'x' });
  assert.equal(empty.success, false);
  // A failure of a template sent by a scene never fires a scene event.
  await post(
    context,
    statusNotification(one.data.outputs.message_id, 'failed', ALICE, {
      code: 132001,
      title: 'Template does not exist',
    }),
  );
  assert.equal(eventsOf(context.gladys, TRIGGERS.MESSAGE_FAILED).length, 0);
});

test('Gladys Plus available: the webhook is registered at Meta, again when the URL changes', async () => {
  const context = await startApp({ webhooks: PLUS });
  const registrations = () =>
    context.graph.calls.filter(
      (call) => call.method === 'POST' && call.path === `${WABA_ID}/subscribed_apps`,
    );
  assert.equal(registrations().length, 1);
  assert.deepEqual(registrations()[0].json, {
    override_callback_uri: WEBHOOK_URL,
    verify_token: 'gladys-verify',
  });
  await context.gladys.fake.webhookUpdated(PLUS);
  assert.equal(registrations().length, 1, 'same URL: not registered again');
  const moved = { ...PLUS, webhooks: [{ ...PLUS.webhooks[0], url: `${WEBHOOK_URL}2` }] };
  await context.gladys.fake.webhookUpdated(moved);
  assert.equal(registrations().length, 2);
  const off = await startApp({ webhooks: PLUS, config: { ...CONFIG, register_webhook: false } });
  assert.ok(!off.graph.calls.some((call) => call.path.endsWith('subscribed_apps')));
});

test('configuration actions: test, register, link a number, diagnostic', async () => {
  const context = await startApp({ webhooks: PLUS, contacts: [linked(ALICE)] });
  const check = (ack) => {
    assert.equal(ack.success, true);
    const message = ack.data.message ?? ack.data;
    assert.deepEqual(Object.keys(message).sort(), [...LANGUAGES].sort());
    Object.values(message).forEach((text) => assert.ok(text.length <= 200, text));
    return message;
  };
  assert.match(
    check(await context.gladys.fake.action(ACTIONS.TEST_CONNECTION)).fr,
    /Connecté à Maison Dupont/,
  );
  assert.match(
    check(await context.gladys.fake.action(ACTIONS.REGISTER_WEBHOOK)).en,
    /Webhook registered/,
  );
  assert.match(
    check(
      await context.gladys.fake.action(ACTIONS.LINK_NUMBER, {
        phone_number: '+49 151 23456789',
        code: 'abcd2345',
      }),
    ).en,
    /\+4915123456789 is now linked to Alice/,
  );
  assert.match(
    check(await context.gladys.fake.action(ACTIONS.LINK_NUMBER, { phone_number: '12', code: 'x' }))
      .en,
    /international format/,
  );

  const ack = await context.gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(check(ack).en, /WhatsApp diagnostic/);
  const lines = context.logs.filter((line) => line.startsWith('WhatsApp diagnostic'));
  assert.ok(lines.length >= 6, lines.join('\n'));
  const all = lines.join('\n');
  assert.ok(!all.includes(TOKEN), 'no token');
  assert.ok(!all.includes('open-api-key-123'), 'no Open API key');
  assert.ok(!all.includes(ALICE), 'no full number');
  assert.match(all, /gladys_notification/);
  assert.match(all, /"points_at_gladys":true/);

  const noPlus = await startApp();
  assert.match(
    check(await noPlus.gladys.fake.action(ACTIONS.REGISTER_WEBHOOK)).en,
    /Gladys Plus webhooks are not active/,
  );
  const noAccount = await startApp({
    webhooks: PLUS,
    config: { ...CONFIG, business_account_id: '' },
  });
  assert.match(
    check(await noAccount.gladys.fake.action(ACTIONS.REGISTER_WEBHOOK)).en,
    /WhatsApp Business account ID/,
  );
  const empty = await startApp({ config: {} });
  assert.match(
    check(await empty.gladys.fake.action(ACTIONS.TEST_CONNECTION)).en,
    /phone number ID/,
  );
});

test('the widget passes the validator of the SDK in every language and state', async () => {
  const context = await startApp({ webhooks: PLUS, contacts: [linked(ALICE)] });
  await post(context, textNotification(ALICE, 'Bonjour'));
  for (const language of LANGUAGES) {
    const ack = await context.gladys.fake.widgetGet(WIDGETS.STATUS, { language, settings: {} });
    assert.equal(ack.success, true);
    assert.deepEqual(validateWidgetContent(ack.data.content), [], language);
    assert.equal(ack.data.content.components.length, 8);
  }
  const empty = await startApp({ config: {} });
  const { content } = (
    await empty.gladys.fake.widgetGet(WIDGETS.STATUS, { language: 'fr', settings: {} })
  ).data;
  assert.equal(content.components[0].type, 'text');
  assert.deepEqual(validateWidgetContent(content), []);
});
