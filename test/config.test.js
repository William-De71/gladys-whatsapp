import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  normalizeConfig,
  isConfigured,
  readLanguage,
  readPhoneNumber,
  readTemplateName,
  readTemplateLanguage,
  maskNumber,
} from '../src/config.js';
import { createStore, dayOf, MAX_SEEN } from '../src/store.js';
import { createFailureEvents, receivedEvent, failedEvent, TRIGGERS } from '../src/events.js';
import { silent, statePath, NOW, ALICE } from './helpers/fixtures.js';

test('normalizes the configuration, with safe defaults', () => {
  assert.deepEqual(normalizeConfig(), {
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    verifyToken: '',
    registerWebhook: true,
    fallbackTemplate: '',
    fallbackLanguage: 'en_US',
    markAsRead: true,
    language: 'auto',
  });
  const config = normalizeConfig({
    phone_number_id: ' 1065 4035 2242 922 ',
    business_account_id: 102290129340398,
    access_token: ' EAAJ ',
    verify_token: ' tok ',
    register_webhook: 'false',
    fallback_template: 'gladys_notification',
    fallback_template_language: 'pt-BR',
    mark_as_read: false,
    language: 'de',
  });
  assert.equal(config.phoneNumberId, '106540352242922');
  assert.equal(config.businessAccountId, '102290129340398');
  assert.equal(config.accessToken, 'EAAJ');
  assert.equal(config.verifyToken, 'tok');
  assert.equal(config.registerWebhook, false);
  assert.equal(config.fallbackLanguage, 'pt_BR');
  assert.equal(config.markAsRead, false);
  assert.equal(config.language, 'de');
  assert.ok(isConfigured(config));
  assert.ok(!isConfigured(normalizeConfig({ phone_number_id: 'abc', access_token: 'x' })));
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
});

test('template names and languages as Meta stores them', () => {
  assert.equal(readTemplateName(' gladys_notification '), 'gladys_notification');
  assert.equal(readTemplateName('Gladys Notification'), '');
  assert.equal(readTemplateLanguage('fr'), 'fr');
  assert.equal(readTemplateLanguage('zh_Hant_HK'), 'zh_Hant_HK');
  assert.equal(readTemplateLanguage('french', 'en_US'), 'en_US');
  assert.equal(readTemplateLanguage('', 'fr'), 'fr');
});

test('phone numbers: international, any punctuation; masked in logs', () => {
  assert.equal(readPhoneNumber('+33 6 12 34 56 78'), ALICE);
  assert.equal(readPhoneNumber('0033 6.12.34.56.78'), ALICE);
  assert.equal(readPhoneNumber('(+49) 151-2345-6789'), '4915123456789');
  assert.equal(readPhoneNumber(33612345678), ALICE);
  assert.equal(readPhoneNumber('06 12'), '');
  assert.equal(readPhoneNumber('abc'), '');
  assert.equal(maskNumber(ALICE), '33•••••••78');
  assert.equal(maskNumber('123'), '•••');
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'xx' }, 'en'), 'en');
});

test('the state survives a restart: windows, seen ids, counters, last webhook', async () => {
  const path = statePath();
  let now = NOW;
  const store = createStore({ path, logger: silent, now: () => now });
  await store.load();
  assert.equal(store.remember('wamid.1'), true);
  assert.equal(store.remember('wamid.1'), false);
  store.inboundFrom(ALICE, NOW - 1000);
  store.inboundFrom(ALICE, NOW - 5000);
  store.count('sent');
  store.count('received');
  store.webhookReceived(NOW);
  await store.save();
  assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 1);

  const again = createStore({ path, logger: silent, now: () => now });
  await again.load();
  assert.equal(again.remember('wamid.1'), false, 'still a duplicate after a restart');
  assert.equal(again.lastInbound(ALICE), NOW - 1000, 'the latest message wins');
  assert.deepEqual(again.counters(), { day: dayOf(NOW), sent: 1, received: 1, failed: 0 });
  assert.equal(again.webhookAt(), NOW);
  now += 24 * 3600 * 1000;
  assert.deepEqual(again.counters(), { day: dayOf(now), sent: 0, received: 0, failed: 0 });
});

test('the state stays bounded, and a broken file starts empty', async () => {
  const store = createStore({ path: statePath(), logger: silent, now: () => NOW });
  for (let i = 0; i < MAX_SEEN + 50; i += 1) {
    store.remember(`wamid.${i}`);
  }
  assert.equal(store.remember('wamid.10'), true, 'the oldest ids are forgotten');
  for (let i = 0; i < 250; i += 1) {
    store.inboundFrom(`3360000${String(i).padStart(4, '0')}`, NOW + i);
  }
  assert.equal(store.lastInbound('33600000000'), null);
  assert.equal(store.lastInbound('33600000249'), NOW + 249);

  const path = statePath();
  await (await import('node:fs/promises')).writeFile(path, '{broken');
  const broken = createStore({ path, logger: silent, now: () => NOW });
  await broken.load();
  assert.equal(broken.webhookAt(), null);
});

test('scene events stay flat and bounded', () => {
  const data = receivedEvent(
    {
      id: 'wamid.1',
      from: ALICE,
      name: 'Alice',
      type: 'text',
      text: 'x'.repeat(5000),
      payload: null,
      latitude: null,
      longitude: null,
      emoji: null,
    },
    { contact_name: 'Alice', user: { first_name: 'Alice' } },
  );
  assert.equal(data.text.length, 1000);
  assert.equal(data.user, 'Alice');
  for (const value of Object.values(data)) {
    assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
  }
  assert.deepEqual(failedEvent(ALICE, { reason: 'auth', code: 190, message: 'Expired' }), {
    to: ALICE,
    reason: 'auth',
    error_code: 190,
    error_title: 'Expired',
    message_id: null,
  });
});

test('message_failed fires on the first failure of a number, then after a success only', async () => {
  const events = [];
  const gladys = { publishSceneEvent: async (key, data) => events.push({ key, data }) };
  const failures = createFailureEvents(gladys, silent);
  assert.equal(await failures.failed(ALICE, { reason: 'outside_window', code: 131047 }), true);
  assert.equal(await failures.failed(ALICE, { reason: 'outside_window', code: 131047 }), false);
  failures.delivered(ALICE);
  assert.equal(await failures.failed(ALICE, { reason: 'undeliverable' }), true);
  assert.deepEqual(
    events.map((event) => [event.key, event.data.reason]),
    [
      [TRIGGERS.MESSAGE_FAILED, 'outside_window'],
      [TRIGGERS.MESSAGE_FAILED, 'undeliverable'],
    ],
  );
  const failing = createFailureEvents(
    {
      publishSceneEvent: async () => {
        throw new Error('429');
      },
    },
    silent,
  );
  assert.equal(await failing.failed(ALICE, { reason: 'other' }), false);
});
