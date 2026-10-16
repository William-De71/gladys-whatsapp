// -----------------------------------------------------------------------------
// Non-regression of everything users store: the keys of the configuration,
// of the buttons, of the webhook (its URL ends with it: Meta keeps it), of the
// scene triggers (filters, options, variables), of the scene action (fields,
// outputs) and of the widget.
//
// test/fixtures/manifest.baseline.json was generated from version 0.1.0 (the
// first release). A failure here means existing users would lose a setting, a
// scene or a widget, or would have to register the webhook at Meta again:
// never update the baseline without a documented migration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/manifest.baseline.json');
const manifest = read('../gladys-assistant-integration.json');
const keys = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));

test('the webhook keeps its key and its mode', () => {
  const current = byKey(manifest.webhooks);
  for (const { key, mode } of baseline.webhooks) {
    assert.equal(current.get(key)?.mode, mode, `webhooks.${key}`);
  }
});

test('no configuration key disappears or changes type', () => {
  const current = byKey(manifest.config_schema);
  for (const { key, type } of baseline.config_schema) {
    assert.equal(current.get(key)?.type, type, `config_schema.${key}`);
  }
});

test('no button or button field disappears', () => {
  const current = byKey(manifest.actions);
  for (const { key, fields } of baseline.actions) {
    assert.ok(current.has(key), `actions.${key}`);
    fields.forEach((field) => assert.ok(keys(current.get(key).fields).includes(field), field));
  }
});

test('scene triggers keep their keys, filters, options and variables', () => {
  const current = byKey(manifest.scene_triggers);
  for (const trigger of baseline.scene_triggers) {
    const now = current.get(trigger.key);
    assert.ok(now, `scene_triggers.${trigger.key}`);
    const fields = byKey(now.fields);
    for (const { key, options } of trigger.fields) {
      assert.ok(fields.has(key), `${trigger.key}.fields.${key}`);
      const values = (fields.get(key).options ?? []).map((option) => option.value);
      options.forEach((value) =>
        assert.ok(values.includes(value), `${trigger.key}.${key}: ${value}`),
      );
    }
    const variables = byKey(now.variables);
    for (const { key, type } of trigger.variables) {
      assert.equal(variables.get(key)?.type, type, `${trigger.key}.variables.${key}`);
    }
  }
});

test('scene actions keep their keys, fields and outputs', () => {
  const current = byKey(manifest.scene_actions);
  for (const action of baseline.scene_actions) {
    const now = current.get(action.key);
    assert.ok(now, `scene_actions.${action.key}`);
    action.fields.forEach((field) =>
      assert.ok(keys(now.fields).includes(field), `${action.key}.${field}`),
    );
    const outputs = byKey(now.outputs);
    for (const { key, type } of action.outputs) {
      assert.equal(outputs.get(key)?.type, type, `${action.key}.outputs.${key}`);
    }
  }
});

test('widgets keep their keys and settings', () => {
  const current = byKey(manifest.widgets);
  for (const widget of baseline.widgets) {
    assert.ok(current.has(widget.key), `widgets.${widget.key}`);
    widget.settings.forEach((key) =>
      assert.ok(keys(current.get(widget.key).settings).includes(key), key),
    );
  }
});
