// -----------------------------------------------------------------------------
// Client of the WhatsApp Business Cloud API (Meta Graph API), with plain fetch.
//
// Every call carries the permanent access token of a system user in the
// Authorization header (never in an URL, never logged). Endpoints used, all
// on https://graph.facebook.com/<version>/:
//   GET  {phone-number-id}?fields=…        the phone number: name, quality…
//   POST {phone-number-id}/messages        text, image, template, read receipt
//   POST {phone-number-id}/media           upload of an image (multipart)
//   POST {waba-id}/subscribed_apps         subscribe the app to the WABA and
//                                          point its webhook at Gladys Plus
//   GET  {waba-id}/message_templates       the templates (diagnostic)
//
// Errors of the Graph API ({ error: { message, type, code, error_subcode,
// error_data: { details } } }) become a WhatsAppError with a `reason` the
// scenes and the messages of the Configuration screen understand.
// -----------------------------------------------------------------------------

const GRAPH_URL = 'https://graph.facebook.com';
const GRAPH_VERSION = 'v25.0';
const REQUEST_TIMEOUT_MS = 20000;
// Limits of the Cloud API: text body, image caption, template parameter.
const MAX_TEXT_LENGTH = 4096;
const MAX_CAPTION_LENGTH = 1024;
const MAX_TEMPLATE_PARAMETER_LENGTH = 1024;
// Images: JPEG or PNG, 5 MB at most.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PHONE_FIELDS = [
  'display_phone_number',
  'verified_name',
  'quality_rating',
  'status',
  'whatsapp_business_manager_messaging_limit',
];

// Graph API error code -> reason. The reasons are the options of the
// `message_failed` scene trigger: never rename one.
const REASONS = {
  0: 'auth',
  190: 'auth',
  3: 'permission',
  10: 'permission',
  200: 'permission',
  131005: 'permission',
  131047: 'outside_window',
  131026: 'undeliverable',
  131021: 'undeliverable',
  // "Recipient phone number not in allowed list": the test number of Meta
  // only reaches the numbers added in API Setup.
  131030: 'not_allowed',
  4: 'rate_limited',
  80007: 'rate_limited',
  130429: 'rate_limited',
  131048: 'rate_limited',
  131056: 'rate_limited',
  132000: 'template',
  132001: 'template',
  132005: 'template',
  132007: 'template',
  132012: 'template',
  132015: 'template',
  132016: 'template',
  132018: 'template',
  368: 'account',
  131031: 'account',
  131042: 'account',
  131045: 'account',
  133010: 'account',
};
const FAILURE_REASONS = [
  'outside_window',
  'undeliverable',
  'not_allowed',
  'template',
  'rate_limited',
  'auth',
  'permission',
  'account',
  'network',
  'other',
];

class WhatsAppError extends Error {
  /**
   * @param {string} message - What went wrong (no secret in it).
   * @param {object} [details] - Details.
   * @param {number|null} [details.code] - Graph API error code.
   * @param {number|null} [details.status] - HTTP status.
   * @param {string|null} [details.details] - error_data.details of Meta.
   * @param {string} [details.reason] - Forced reason.
   */
  constructor(message, { code = null, status = null, details = null, reason } = {}) {
    super(message);
    this.name = 'WhatsAppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.reason = reason ?? reasonOf(code, status);
  }
}

/**
 * @description The reason of a Graph API error code.
 * @param {number|null} code - The error code.
 * @param {number|null} [status] - The HTTP status.
 * @returns {string} One of FAILURE_REASONS.
 * @example
 * reasonOf(131047); // -> 'outside_window'
 */
function reasonOf(code, status = null) {
  if (code !== null && code !== undefined && REASONS[code]) {
    return REASONS[code];
  }
  if (code >= 200 && code <= 299) {
    return 'permission';
  }
  if (status === 401) {
    return 'auth';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  return 'other';
}

/**
 * @description The type of an image out of its first bytes.
 * @param {Buffer} bytes - The image.
 * @returns {string|null} 'image/jpeg', 'image/png' or null.
 * @example
 * imageType(Buffer.from([0xff, 0xd8, 0xff])); // -> 'image/jpeg'
 */
function imageType(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length > 8 && bytes.toString('latin1', 1, 4) === 'PNG') {
    return 'image/png';
  }
  return null;
}

/**
 * @description Decode the image Gladys attaches to a message: raw base64 or a
 * data URL.
 * @param {string} file - The attachment.
 * @returns {{ bytes: Buffer, type: string }|null} The image, null when it is
 * not a JPEG or PNG image the Cloud API accepts.
 * @example
 * decodeImage('data:image/jpeg;base64,/9j/4AAQ…');
 */
function decodeImage(file) {
  if (typeof file !== 'string' || file.length === 0) {
    return null;
  }
  const base64 = file.replace(/^data:[^,]*,/, '');
  const bytes = Buffer.from(base64, 'base64');
  const type = imageType(bytes);
  if (!type || bytes.length > MAX_IMAGE_BYTES) {
    return null;
  }
  return { bytes, type };
}

/**
 * @description Split a text into parts the Cloud API accepts, at a line or a
 * space when possible.
 * @param {string} text - The text.
 * @param {number} [max] - The size of a part.
 * @returns {string[]} The parts (none for an empty text).
 * @example
 * splitText('a'.repeat(5000)).length; // -> 2
 */
function splitText(text, max = MAX_TEXT_LENGTH) {
  const parts = [];
  let rest = String(text ?? '').trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const end = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  if (rest.length > 0) {
    parts.push(rest);
  }
  return parts;
}

/**
 * @description A text as a template parameter: Meta refuses new lines, tabs
 * and more than four spaces in a row there (#132018), and texts over 1024
 * characters.
 * @param {unknown} value - The text.
 * @returns {string} The parameter.
 * @example
 * templateParameter('Door open\nKitchen'); // -> 'Door open · Kitchen'
 */
function templateParameter(value) {
  const text = String(value ?? '')
    .replace(/\s*[\r\n]+\s*/g, ' · ')
    .replace(/\t/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
  return text.length > MAX_TEMPLATE_PARAMETER_LENGTH
    ? `${text.slice(0, MAX_TEMPLATE_PARAMETER_LENGTH - 1)}…`
    : text;
}

/**
 * @description The body parameters of a template, from the text of a scene:
 * values separated by `|`, positional ({{1}}, {{2}}…) or named
 * (`first_name=Alice|room=kitchen`).
 * @param {string|string[]} raw - The parameters.
 * @returns {object[]} The `parameters` of the body component.
 * @example
 * templateParameters('Alice|kitchen'); // -> [{ type: 'text', text: 'Alice' }, …]
 */
function templateParameters(raw) {
  const values = Array.isArray(raw) ? raw : String(raw ?? '').split('|');
  return values
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      const named = /^([a-z_][a-z0-9_]*)\s*=\s*(.*)$/s.exec(value);
      return named
        ? { type: 'text', parameter_name: named[1], text: templateParameter(named[2]) }
        : { type: 'text', text: templateParameter(value) };
    });
}

/**
 * @description Create a Cloud API client.
 * @param {object} options - Options.
 * @param {string} options.accessToken - The access token.
 * @param {string} options.phoneNumberId - The business phone number id.
 * @param {string} [options.businessAccountId] - The WABA id.
 * @param {typeof fetch} [options.fetchImpl] - fetch (injected by the tests).
 * @param {number} [options.timeoutMs] - Timeout of a request.
 * @returns {object} The client.
 * @example
 * const api = createGraphApi({ accessToken, phoneNumberId });
 * await api.sendText('33612345678', 'Hello');
 */
function createGraphApi({
  accessToken,
  phoneNumberId,
  businessAccountId = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  /**
   * @description One call of the Graph API.
   * @param {string} method - HTTP method.
   * @param {string} path - Path after the version.
   * @param {object} [options] - Options.
   * @param {object} [options.json] - JSON body.
   * @param {FormData} [options.form] - Multipart body.
   * @param {Record<string, string>} [options.query] - Query.
   * @returns {Promise<object>} The JSON answer.
   */
  async function call(method, path, { json, form, query } = {}) {
    const url = new URL(`${GRAPH_URL}/${GRAPH_VERSION}/${path}`);
    Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    let body;
    if (json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new WhatsAppError(
        timeout ? 'The Cloud API did not answer in time' : `Network error: ${err?.message}`,
        { reason: 'network' },
      );
    }
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!response.ok || data.error) {
      const error = data.error ?? {};
      throw new WhatsAppError(
        `${error.message ?? `HTTP ${response.status}`}${error.code ? ` (#${error.code})` : ''}`,
        {
          code: Number.isFinite(error.code) ? error.code : null,
          status: response.status,
          details: error.error_data?.details ?? null,
        },
      );
    }
    return data;
  }

  const send = (to, message) =>
    call('POST', `${phoneNumberId}/messages`, {
      json: { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message },
    }).then((data) => ({
      id: data.messages?.[0]?.id ?? null,
      waId: data.contacts?.[0]?.wa_id ?? to,
    }));

  return {
    /**
     * @description The business phone number.
     * @returns {Promise<object>} `{ id, display_phone_number, verified_name,
     * quality_rating, status, whatsapp_business_manager_messaging_limit }`.
     */
    getPhoneNumber: () => call('GET', phoneNumberId, { query: { fields: PHONE_FIELDS.join(',') } }),
    /**
     * @description Send a text (one message, 4096 characters at most).
     * @param {string} to - The recipient (digits).
     * @param {string} text - The text.
     * @returns {Promise<{ id: string|null, waId: string }>} The message.
     */
    sendText: (to, text) =>
      send(to, {
        type: 'text',
        text: { preview_url: false, body: text.slice(0, MAX_TEXT_LENGTH) },
      }),
    /**
     * @description Upload an image and send it, with a caption.
     * @param {string} to - The recipient.
     * @param {{ bytes: Buffer, type: string }} image - decodeImage.
     * @param {string} [caption] - The caption (1024 characters at most).
     * @returns {Promise<{ id: string|null, waId: string }>} The message.
     */
    async sendImage(to, image, caption = '') {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', image.type);
      form.append(
        'file',
        new Blob([image.bytes], { type: image.type }),
        image.type === 'image/png' ? 'image.png' : 'image.jpg',
      );
      const media = await call('POST', `${phoneNumberId}/media`, { form });
      if (!media.id) {
        throw new WhatsAppError('The Cloud API returned no media id');
      }
      const content = { id: media.id };
      if (caption) {
        content.caption = caption.slice(0, MAX_CAPTION_LENGTH);
      }
      return send(to, { type: 'image', image: content });
    },
    /**
     * @description Send an approved template.
     * @param {string} to - The recipient.
     * @param {string} name - The template name.
     * @param {string} language - Its language code.
     * @param {object[]} [parameters] - Body parameters (templateParameters).
     * @returns {Promise<{ id: string|null, waId: string }>} The message.
     */
    sendTemplate: (to, name, language, parameters = []) =>
      send(to, {
        type: 'template',
        template: {
          name,
          language: { code: language },
          ...(parameters.length > 0 ? { components: [{ type: 'body', parameters }] } : {}),
        },
      }),
    /**
     * @description Blue ticks: mark a received message (and the ones before
     * it) as read.
     * @param {string} messageId - The wamid.
     * @returns {Promise<object>} `{ success: true }`.
     */
    markAsRead: (messageId) =>
      call('POST', `${phoneNumberId}/messages`, {
        json: { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      }),
    /**
     * @description Subscribe the app to the WABA and send its webhooks to an
     * alternate callback URL. Meta verifies the URL (GET with the verify
     * token) before answering.
     * @param {string} url - The callback URL (200 characters at most).
     * @param {string} verifyToken - The verify token.
     * @returns {Promise<object>} `{ success: true }`.
     */
    registerWebhook: (url, verifyToken) =>
      call('POST', `${businessAccountId}/subscribed_apps`, {
        json: { override_callback_uri: url, verify_token: verifyToken },
      }),
    /**
     * @description The apps subscribed to the WABA, with their alternate URL.
     * @returns {Promise<object[]>} `[{ whatsapp_business_api_data, override_callback_uri }]`.
     */
    subscribedApps: () =>
      call('GET', `${businessAccountId}/subscribed_apps`).then((data) => data.data ?? []),
    /**
     * @description The message templates of the WABA (first page).
     * @returns {Promise<object[]>} `[{ name, language, status, category }]`.
     */
    listTemplates: () =>
      call('GET', `${businessAccountId}/message_templates`, {
        query: { fields: 'name,language,status,category', limit: '100' },
      }).then((data) => data.data ?? []),
  };
}

export {
  GRAPH_URL,
  GRAPH_VERSION,
  MAX_TEXT_LENGTH,
  MAX_CAPTION_LENGTH,
  MAX_IMAGE_BYTES,
  FAILURE_REASONS,
  WhatsAppError,
  reasonOf,
  imageType,
  decodeImage,
  splitText,
  templateParameter,
  templateParameters,
  createGraphApi,
};
