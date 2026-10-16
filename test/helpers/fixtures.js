// A fake WhatsApp Cloud API for the tests: answers of the Graph API as the
// documentation of Meta shows them (v25.0), served through the `fetchImpl`
// option of the client, and the notifications Meta posts to the webhook.
// Tests never touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-16T18:00:00Z');
const PHONE_NUMBER_ID = '106540352242922';
const WABA_ID = '102290129340398';
const TOKEN = 'EAAJB-test-token';
const ALICE = '33612345678';
const BOB = '4915123456789';
const STRANGER = '34600000000';
const WEBHOOK_URL =
  'https://api.gladysgateway.com/v1/api/external-integration/open-api-key-123/test-integration/meta';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the state file.
 * @returns {string} The path (its directory exists, the file does not).
 */
const statePath = () => join(mkdtempSync(join(tmpdir(), 'whatsapp-')), 'state.json');

const PHONE = {
  id: PHONE_NUMBER_ID,
  display_phone_number: '+33 1 23 45 67 89',
  verified_name: 'Maison Dupont',
  quality_rating: 'GREEN',
  status: 'CONNECTED',
  whatsapp_business_manager_messaging_limit: 'TIER_250',
};

/**
 * @description A Graph API error body.
 * @param {number} code - The error code.
 * @param {string} message - The message.
 * @returns {object} The body.
 */
const graphError = (code, message) => ({
  error: {
    message,
    type: 'OAuthException',
    code,
    error_data: { messaging_product: 'whatsapp', details: message },
    fbtrace_id: 'Az8or2yhqkZfEZ-_4Qn_Bam',
  },
});

/**
 * @description A fake fetch of the Graph API. `routes` maps "METHOD path" (the
 * path after the version) to a body, a `{ status, body }`, or a function of
 * the request returning one of them.
 * @param {object} [routes] - Answers overriding the defaults.
 * @returns {{ fetchImpl: Function, calls: object[] }} The fake.
 */
function fakeGraph(routes = {}) {
  const calls = [];
  let counter = 0;
  const defaults = {
    [`GET ${PHONE_NUMBER_ID}`]: PHONE,
    [`POST ${PHONE_NUMBER_ID}/messages`]: (request) =>
      request.json?.status === 'read'
        ? { success: true }
        : {
            messaging_product: 'whatsapp',
            contacts: [{ input: request.json.to, wa_id: request.json.to }],
            messages: [{ id: `wamid.out${(counter += 1)}` }],
          },
    [`POST ${PHONE_NUMBER_ID}/media`]: { id: '1037543291543636' },
    [`POST ${WABA_ID}/subscribed_apps`]: { success: true },
    [`GET ${WABA_ID}/subscribed_apps`]: {
      data: [
        {
          whatsapp_business_api_data: { id: '670843887433847', name: 'Gladys' },
          override_callback_uri: WEBHOOK_URL,
        },
      ],
    },
    [`GET ${WABA_ID}/message_templates`]: {
      data: [
        { name: 'gladys_notification', language: 'fr', status: 'APPROVED', category: 'UTILITY' },
      ],
    },
  };
  const table = { ...defaults, ...routes };
  async function fetchImpl(url, init = {}) {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/v\d+\.\d+\//, '');
    const request = {
      method: init.method,
      path,
      url: parsed,
      headers: init.headers,
      json: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      form: init.body instanceof FormData ? init.body : undefined,
    };
    calls.push(request);
    let answer = table[`${init.method} ${path}`];
    if (typeof answer === 'function') {
      answer = await answer(request);
    }
    if (answer === undefined) {
      answer = { status: 404, body: graphError(100, `Unknown path ${path}`) };
    }
    const { status, body } =
      answer && Object.prototype.hasOwnProperty.call(answer, 'status') && answer.body !== undefined
        ? answer
        : { status: 200, body: answer };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return { fetchImpl, calls };
}

/**
 * @description A notification of Meta, as posted to the webhook.
 * @param {object} value - The `value` of the change.
 * @returns {string} The raw body.
 */
const notification = (value) =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '33123456789', phone_number_id: PHONE_NUMBER_ID },
              ...value,
            },
          },
        ],
      },
    ],
  });

/**
 * @description A notification carrying one text message.
 * @param {string} from - The sender.
 * @param {string} body - The text.
 * @param {object} [extra] - Fields of the message.
 * @returns {string} The raw body.
 */
const textNotification = (from, body, extra = {}) =>
  notification({
    contacts: [{ profile: { name: 'Alice' }, wa_id: from }],
    messages: [
      {
        from,
        id: extra.id ?? `wamid.in-${from}-${body.length}`,
        timestamp: String(Math.floor((extra.at ?? NOW) / 1000)),
        type: 'text',
        text: { body },
      },
    ],
  });

/**
 * @description A notification carrying one status.
 * @param {string} id - The wamid.
 * @param {string} status - sent, delivered, read or failed.
 * @param {string} recipient - The recipient.
 * @param {object} [error] - `{ code, title }` of a failed one.
 * @returns {string} The raw body.
 */
const statusNotification = (id, status, recipient, error) =>
  notification({
    statuses: [
      {
        id,
        status,
        timestamp: String(Math.floor(NOW / 1000)),
        recipient_id: recipient,
        ...(error
          ? {
              errors: [
                {
                  code: error.code,
                  title: error.title,
                  message: error.title,
                  error_data: { details: error.title },
                },
              ],
            }
          : {}),
      },
    ],
  });

const CONFIG = {
  phone_number_id: PHONE_NUMBER_ID,
  access_token: TOKEN,
  business_account_id: WABA_ID,
  verify_token: 'gladys-verify',
};

const linked = (number, firstName = 'Alice', language = 'fr') => ({
  contact_id: number,
  contact_name: firstName,
  linked_at: '2026-10-01T10:00:00.000Z',
  user: { selector: firstName.toLowerCase(), first_name: firstName, language },
});

export {
  NOW,
  PHONE_NUMBER_ID,
  WABA_ID,
  TOKEN,
  ALICE,
  BOB,
  STRANGER,
  WEBHOOK_URL,
  PHONE,
  CONFIG,
  silent,
  statePath,
  graphError,
  fakeGraph,
  notification,
  textNotification,
  statusNotification,
  linked,
};
