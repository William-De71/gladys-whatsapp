// -----------------------------------------------------------------------------
// The webhook of Meta, relayed by Gladys Plus.
//
// Meta calls one callback URL for the WhatsApp Business Account:
//   - GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… when the URL
//     is registered: answer the challenge, as plain text, if the token is ours;
//   - POST {"object":"whatsapp_business_account","entry":[{"changes":[{
//     "field":"messages","value":{…}}]}]} for every message received and every
//     status (sent, delivered, read, failed) of a message sent.
//
// Gladys Plus relays the method, the query and the raw body, but no header:
// the X-Hub-Signature-256 signature of Meta cannot be checked here. What
// protects the webhook is its URL (it carries the Gladys Plus Open API key of
// the user, a secret that already grants as much through the Open API) and the
// checks below: only the configured phone number, only linked contacts reach
// the brain of Gladys (see app.js).
// -----------------------------------------------------------------------------

const MESSAGE_TYPES = [
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker',
  'location',
  'contacts',
  'button',
  'interactive',
  'reaction',
];

/**
 * @description Answer the verification request of Meta.
 * @param {Record<string, string>} query - The query of the GET request.
 * @param {string} verifyToken - The verify token of the integration.
 * @returns {{ status: number, contentType: string, body: string }} The response.
 * @example
 * verifyChallenge({ 'hub.mode': 'subscribe', 'hub.verify_token': 't', 'hub.challenge': '42' }, 't');
 */
function verifyChallenge(query, verifyToken) {
  const challenge = query?.['hub.challenge'];
  if (
    query?.['hub.mode'] === 'subscribe' &&
    verifyToken &&
    query['hub.verify_token'] === verifyToken &&
    typeof challenge === 'string' &&
    challenge.length > 0
  ) {
    return { status: 200, contentType: 'text/plain', body: challenge };
  }
  return { status: 403, contentType: 'text/plain', body: 'Forbidden' };
}

/**
 * @description The text a message carries for Gladys: its body, the label of
 * a button tapped, or the caption of a media. Null for the others.
 * @param {object} message - A message of the webhook.
 * @returns {string|null} The text.
 * @example
 * textOf({ type: 'text', text: { body: 'Hello' } }); // -> 'Hello'
 */
function textOf(message) {
  switch (message?.type) {
    case 'text':
      return message.text?.body ?? null;
    case 'button':
      return message.button?.text ?? null;
    case 'interactive':
      return (
        message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null
      );
    case 'image':
    case 'video':
    case 'document':
      return message[message.type]?.caption ?? null;
    default:
      return null;
  }
}

/**
 * @description The payload of a button tapped (quick reply of a template, or
 * reply button), for scenes.
 * @param {object} message - A message of the webhook.
 * @returns {string|null} The payload.
 */
function payloadOf(message) {
  if (message?.type === 'button') {
    return message.button?.payload ?? null;
  }
  if (message?.type === 'interactive') {
    return message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id ?? null;
  }
  return null;
}

const seconds = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number * 1000 : null;
};

/**
 * @description Read a webhook body of Meta into plain messages and statuses.
 * Anything else (another object, another field, a broken body) is ignored.
 * @param {string|object|null} body - The raw body relayed by Gladys Plus.
 * @returns {{ messages: object[], statuses: object[] }} What it carries.
 * @example
 * const { messages, statuses } = parseNotification(request.body);
 */
function parseNotification(body) {
  const result = { messages: [], statuses: [] };
  let payload = body;
  if (typeof body === 'string') {
    try {
      payload = JSON.parse(body);
    } catch {
      return result;
    }
  }
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return result;
  }
  for (const entry of payload.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== 'messages' || !value) {
        continue;
      }
      const phoneNumberId = String(value.metadata?.phone_number_id ?? '');
      const names = new Map(
        (Array.isArray(value.contacts) ? value.contacts : []).map((contact) => [
          String(contact?.wa_id ?? ''),
          contact?.profile?.name ?? null,
        ]),
      );
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        if (!message?.id || !message.from) {
          continue;
        }
        const from = String(message.from);
        result.messages.push({
          id: String(message.id),
          from,
          name: names.get(from) ?? null,
          phoneNumberId,
          at: seconds(message.timestamp),
          type: MESSAGE_TYPES.includes(message.type) ? message.type : 'other',
          text: textOf(message),
          payload: payloadOf(message),
          latitude: Number.isFinite(message.location?.latitude) ? message.location.latitude : null,
          longitude: Number.isFinite(message.location?.longitude)
            ? message.location.longitude
            : null,
          emoji: message.type === 'reaction' ? (message.reaction?.emoji ?? null) : null,
        });
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!status?.id || !status.status) {
          continue;
        }
        const error = Array.isArray(status.errors) ? status.errors[0] : null;
        result.statuses.push({
          id: String(status.id),
          status: String(status.status),
          recipient: String(status.recipient_id ?? ''),
          phoneNumberId,
          at: seconds(status.timestamp),
          error: error
            ? {
                code: Number(error.code) || null,
                title: error.title ?? error.message ?? null,
                details: error.error_data?.details ?? null,
              }
            : null,
        });
      }
    }
  }
  return result;
}

export { verifyChallenge, parseNotification, textOf, payloadOf, MESSAGE_TYPES };
