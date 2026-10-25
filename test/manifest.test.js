import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS, SCENE_ACTIONS, receivedEvent, failedEvent } from '../src/events.js';
import { ACTIONS, WEBHOOK_KEY } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { MESSAGE_TYPES } from '../src/webhook.js';
import { FAILURE_REASONS } from '../src/graph-api.js';
import { AUTO_LANGUAGE, DEFAULT_TEMPLATE_LANGUAGE } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a bidirectional communication integration, in lockstep with package.json, at 0.x', () => {
  assert.equal(manifest.type, 'communication');
  assert.deepEqual(manifest.messaging, { receive: true });
  assert.equal(manifest.contact_schema, undefined, 'only for send-only channels');
  assert.equal(manifest.name, 'WhatsApp');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-whatsapp:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-whatsapp/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-whatsapp');
});

test('declares the cloud transport only: the Graph API of Meta', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  const code = source('../src/graph-api.js')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
  const hosts = [...code.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(hosts)], ['graph.facebook.com']);
});

test('one sync webhook through Gladys Plus; no other permission', () => {
  assert.deepEqual(
    manifest.webhooks.map(({ key, mode }) => ({ key, mode })),
    [{ key: WEBHOOK_KEY, mode: 'sync' }],
  );
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery']) {
    assert.equal(manifest[key], undefined, key);
  }
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['notifications', 'assistants']);
  // No widget button with a form: those need Gladys 5.2.0.
  assert.doesNotMatch(source('../src/widgets.js'), /fields:/);
});

test('declares exactly the scene triggers, actions, widgets and buttons the code handles', () => {
  const app = source('../src/app.js');
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key),
    Object.values(SCENE_ACTIONS),
  );
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key),
    Object.values(WIDGETS),
  );
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
  for (const handler of ['onSendMessage', 'onWebhook(WEBHOOK_KEY', 'onWebhookUpdated']) {
    assert.ok(app.includes(handler), handler);
  }
});

test('mirrors the values of the code', () => {
  const config = byKey(manifest.config_schema);
  assert.equal(config.get('access_token').type, 'secret');
  assert.equal(config.get('phone_number_id').type, 'string');
  assert.equal(config.get('phone_number_id').required, true);
  assert.equal(config.get('register_webhook').default, true);
  assert.equal(config.get('mark_as_read').default, true);
  assert.equal(config.get('fallback_template_language').default, DEFAULT_TEMPLATE_LANGUAGE);
  const language = config.get('language');
  assert.deepEqual(values(language), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(language.default, AUTO_LANGUAGE);
  const triggers = byKey(manifest.scene_triggers);
  const types = byKey(triggers.get(TRIGGERS.MESSAGE_RECEIVED).fields).get('message_type');
  assert.deepEqual([...values(types)].sort(), [...MESSAGE_TYPES, 'other'].sort());
  const reasons = byKey(triggers.get(TRIGGERS.MESSAGE_FAILED).fields).get('reason');
  assert.deepEqual(values(reasons), FAILURE_REASONS);
  // Every filter and variable of a trigger is a key of its event data.
  const data = {
    [TRIGGERS.MESSAGE_RECEIVED]: receivedEvent({ id: 'w', from: '1', type: 'text' }, null),
    [TRIGGERS.MESSAGE_FAILED]: failedEvent('1', { reason: 'other' }),
  };
  for (const trigger of manifest.scene_triggers) {
    const keys = Object.keys(data[trigger.key]).sort();
    assert.deepEqual(trigger.variables.map((variable) => variable.key).sort(), keys, trigger.key);
    for (const field of trigger.fields) {
      assert.ok(keys.includes(field.key), `${trigger.key}.${field.key}`);
    }
  }
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.actions.length <= 10);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok((action.fields ?? []).length <= 10, action.key);
  }
  for (const widget of manifest.widgets) {
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('catalog fields of Gladys 5.3: search keywords, available worldwide', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.ok(Array.isArray(manifest.keywords), 'keywords');
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10, '1 to 10 keywords');
  for (const keyword of manifest.keywords) {
    assert.ok(keyword.length <= 30 && keyword.trim().length >= 2, keyword);
  }
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'unique once trimmed and lowercased');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'the name is already searched');
  // No `countries`: usable anywhere, the catalog shows it in every country.
  assert.equal(manifest.countries, undefined);
});
