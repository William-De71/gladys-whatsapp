// -----------------------------------------------------------------------------
// Scene triggers and scene actions of the WhatsApp integration.
//
// Triggers (gladys.publishSceneEvent):
//   - `message_received`  a linked contact sent a message (text, button tapped,
//                         image, location…): one event per message, after the
//                         duplicates of Meta are dropped;
//   - `message_failed`    WhatsApp did not deliver a message Gladys sent: on
//                         the first failure for a number, then again only
//                         after a message to that number went through, so that
//                         a scene warning through this same channel cannot
//                         loop. A failure of a message sent by a scene action
//                         never fires it (no event caused by a scene action).
//
// Actions (gladys.onSceneAction):
//   - `send_template`     send an approved message template, with its body
//                         parameters, to a number or to every linked contact.
//
// Event data stays flat: scalars only, strings of 1 000 characters at most.
// -----------------------------------------------------------------------------

const TRIGGERS = { MESSAGE_RECEIVED: 'message_received', MESSAGE_FAILED: 'message_failed' };
const SCENE_ACTIONS = { SEND_TEMPLATE: 'send_template' };
const MAX_EVENT_STRING = 1000;

const text = (value) =>
  value === null || value === undefined ? null : String(value).slice(0, MAX_EVENT_STRING);

/**
 * @description The data of a `message_received` event.
 * @param {object} message - A message of parseNotification.
 * @param {object|null} contact - The linked contact (getContacts entry).
 * @returns {object} The flat data.
 * @example
 * receivedEvent({ id: 'wamid.1', from: '33612345678', type: 'text', text: 'Hi' }, contact);
 */
function receivedEvent(message, contact) {
  return {
    from: message.from,
    contact_name: text(message.name ?? contact?.contact_name ?? null),
    user: text(contact?.user?.first_name ?? null),
    message_type: message.type,
    text: text(message.text),
    payload: text(message.payload),
    latitude: message.latitude,
    longitude: message.longitude,
    emoji: text(message.emoji),
    message_id: text(message.id),
  };
}

/**
 * @description The data of a `message_failed` event.
 * @param {string} to - The recipient (digits).
 * @param {{ reason: string, code?: number|null, message?: string, title?: string|null }} error - The failure.
 * @param {string|null} [messageId] - The wamid, when Meta accepted the message first.
 * @returns {object} The flat data.
 * @example
 * failedEvent('33612345678', { reason: 'outside_window', code: 131047 }, 'wamid.1');
 */
function failedEvent(to, error, messageId = null) {
  return {
    to,
    reason: error.reason,
    error_code: Number.isFinite(error.code) ? error.code : null,
    error_title: text(error.title ?? error.message ?? null),
    message_id: text(messageId),
  };
}

/**
 * @description Remember which numbers already failed, to fire
 * `message_failed` once per run of failures.
 * @param {object} gladys - The Gladys client.
 * @param {object} logger - Logger.
 * @returns {{ failed: Function, delivered: Function }} The tracker.
 * @example
 * const failures = createFailureEvents(gladys, logger);
 * await failures.failed('33612345678', error);
 */
function createFailureEvents(gladys, logger) {
  const failing = new Set();
  return {
    /**
     * @description A message to this number failed: fire on the first one.
     * @param {string} to - The recipient.
     * @param {object} error - The failure.
     * @param {string|null} [messageId] - The wamid.
     * @returns {Promise<boolean>} Whether an event was published.
     */
    async failed(to, error, messageId = null) {
      if (failing.has(to)) {
        return false;
      }
      failing.add(to);
      try {
        await gladys.publishSceneEvent(TRIGGERS.MESSAGE_FAILED, failedEvent(to, error, messageId));
        return true;
      } catch (err) {
        logger.warn(`Unable to publish the message_failed event: ${err.message}`);
        return false;
      }
    },
    /** @param {string} to - A message to this number went through. */
    delivered(to) {
      failing.delete(to);
    },
  };
}

export {
  TRIGGERS,
  SCENE_ACTIONS,
  MAX_EVENT_STRING,
  receivedEvent,
  failedEvent,
  createFailureEvents,
};
