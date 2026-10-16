import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAPH_VERSION,
  WhatsAppError,
  createGraphApi,
  decodeImage,
  imageType,
  reasonOf,
  splitText,
  templateParameter,
  templateParameters,
  FAILURE_REASONS,
} from '../src/graph-api.js';
import {
  fakeGraph,
  graphError,
  PHONE_NUMBER_ID,
  WABA_ID,
  TOKEN,
  ALICE,
} from './helpers/fixtures.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const client = (routes) => {
  const fake = fakeGraph(routes);
  const api = createGraphApi({
    accessToken: TOKEN,
    phoneNumberId: PHONE_NUMBER_ID,
    businessAccountId: WABA_ID,
    fetchImpl: fake.fetchImpl,
  });
  return { api, calls: fake.calls };
};

test('every call carries the token in the Authorization header, never in the URL', async () => {
  const { api, calls } = client();
  await api.getPhoneNumber();
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!calls[0].url.href.includes(TOKEN));
  assert.equal(calls[0].url.origin, 'https://graph.facebook.com');
  assert.ok(calls[0].url.pathname.startsWith(`/${GRAPH_VERSION}/`));
  assert.match(calls[0].url.searchParams.get('fields'), /quality_rating/);
  assert.match(
    calls[0].url.searchParams.get('fields'),
    /whatsapp_business_manager_messaging_limit/,
  );
});

test('sends a text, an image with a caption, a template and a read receipt', async () => {
  const { api, calls } = client();
  const text = await api.sendText(ALICE, 'Hello');
  assert.deepEqual(text, { id: 'wamid.out1', waId: ALICE });
  assert.deepEqual(calls[0].json, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: ALICE,
    type: 'text',
    text: { preview_url: false, body: 'Hello' },
  });

  await api.sendImage(ALICE, { bytes: PNG, type: 'image/png' }, 'Front door');
  assert.equal(calls[1].path, `${PHONE_NUMBER_ID}/media`);
  assert.equal(calls[1].form.get('messaging_product'), 'whatsapp');
  assert.equal(calls[1].form.get('type'), 'image/png');
  assert.equal(calls[1].form.get('file').size, PNG.length);
  assert.deepEqual(calls[2].json.image, { id: '1037543291543636', caption: 'Front door' });

  await api.sendTemplate(ALICE, 'gladys_notification', 'fr', templateParameters('Door open'));
  assert.deepEqual(calls[3].json.template, {
    name: 'gladys_notification',
    language: { code: 'fr' },
    components: [{ type: 'body', parameters: [{ type: 'text', text: 'Door open' }] }],
  });
  await api.sendTemplate(ALICE, 'hello_world', 'en_US');
  assert.equal(calls[4].json.template.components, undefined);

  await api.markAsRead('wamid.in1');
  assert.deepEqual(calls[5].json, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: 'wamid.in1',
  });
});

test('points the webhook of the WABA at an URL with its verify token', async () => {
  const { api, calls } = client();
  await api.registerWebhook('https://example.org/hook', 'token-1');
  assert.equal(calls[0].path, `${WABA_ID}/subscribed_apps`);
  assert.deepEqual(calls[0].json, {
    override_callback_uri: 'https://example.org/hook',
    verify_token: 'token-1',
  });
  assert.equal((await api.listTemplates())[0].name, 'gladys_notification');
  assert.equal((await api.subscribedApps()).length, 1);
});

test('turns Graph API errors into reasons', async () => {
  const { api } = client({
    [`GET ${PHONE_NUMBER_ID}`]: {
      status: 401,
      body: graphError(190, 'Invalid OAuth access token'),
    },
    [`POST ${PHONE_NUMBER_ID}/messages`]: {
      status: 400,
      body: graphError(131047, 'Re-engagement message'),
    },
  });
  await assert.rejects(api.getPhoneNumber(), (err) => {
    assert.ok(err instanceof WhatsAppError);
    assert.equal(err.reason, 'auth');
    assert.equal(err.code, 190);
    assert.doesNotMatch(err.message, new RegExp(TOKEN));
    return true;
  });
  await assert.rejects(api.sendText(ALICE, 'Hi'), { reason: 'outside_window', code: 131047 });
  assert.equal(reasonOf(131026), 'undeliverable');
  assert.equal(reasonOf(130429), 'rate_limited');
  assert.equal(reasonOf(132001), 'template');
  assert.equal(reasonOf(250), 'permission');
  assert.equal(reasonOf(null, 429), 'rate_limited');
  assert.equal(reasonOf(999999), 'other');
  for (const code of [0, 3, 190, 131047, 131030, 132018, 368, 80007]) {
    assert.ok(FAILURE_REASONS.includes(reasonOf(code)), String(code));
  }
});

test('a network failure or a timeout is a `network` reason', async () => {
  const api = createGraphApi({
    accessToken: TOKEN,
    phoneNumberId: PHONE_NUMBER_ID,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(api.getPhoneNumber(), { reason: 'network' });
  const slow = createGraphApi({
    accessToken: TOKEN,
    phoneNumberId: PHONE_NUMBER_ID,
    // What fetch rejects with once AbortSignal.timeout fires.
    fetchImpl: async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    },
  });
  await assert.rejects(slow.getPhoneNumber(), { reason: 'network' });
});

test('images: JPEG and PNG only, raw base64 or data URL, 5 MB at most', () => {
  assert.equal(imageType(PNG), 'image/png');
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(imageType(Buffer.from('GIF89a')), null);
  assert.equal(decodeImage(PNG.toString('base64')).type, 'image/png');
  assert.equal(decodeImage(`data:image/png;base64,${PNG.toString('base64')}`).type, 'image/png');
  assert.equal(decodeImage(Buffer.from('GIF89a....').toString('base64')), null);
  assert.equal(decodeImage(null), null);
  const big = Buffer.alloc(5 * 1024 * 1024 + 10);
  big[0] = 0xff;
  big[1] = 0xd8;
  big[2] = 0xff;
  assert.equal(decodeImage(big.toString('base64')), null);
});

test('long texts are split at a line or a space, under 4096 characters', () => {
  assert.deepEqual(splitText('  '), []);
  assert.deepEqual(splitText('short'), ['short']);
  const words = Array.from({ length: 1500 }, (_, i) => `word${i}`).join(' ');
  const parts = splitText(words);
  assert.ok(parts.length >= 2);
  parts.forEach((part) => assert.ok(part.length <= 4096 && !part.startsWith(' ')));
  assert.equal(parts.join(' '), words);
  assert.deepEqual(
    splitText('x'.repeat(9000)).map((part) => part.length),
    [4096, 4096, 808],
  );
});

test('template parameters: no new line nor tab, named or positional, bounded', () => {
  assert.equal(templateParameter('Door open\nKitchen\t 21 °C'), 'Door open · Kitchen  21 °C');
  assert.equal(templateParameter('a      b'), 'a   b');
  assert.equal(templateParameter('x'.repeat(2000)).length, 1024);
  assert.deepEqual(templateParameters('Kitchen| 21.5 °C |'), [
    { type: 'text', text: 'Kitchen' },
    { type: 'text', text: '21.5 °C' },
  ]);
  assert.deepEqual(templateParameters('first_name=Alice|room = kitchen'), [
    { type: 'text', parameter_name: 'first_name', text: 'Alice' },
    { type: 'text', parameter_name: 'room', text: 'kitchen' },
  ]);
  assert.deepEqual(templateParameters('1+1=2'), [{ type: 'text', text: '1+1=2' }]);
  assert.deepEqual(templateParameters(''), []);
});
