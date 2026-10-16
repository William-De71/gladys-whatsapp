// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data/state.json (the
// only writable path of the container):
//
//   - `inbound`   last message received from each WhatsApp number (ms): the
//                 24-hour customer service window of WhatsApp opens at each
//                 message of the user, and only then may free-form text be
//                 sent to them;
//   - `seen`      ids of the last messages received: Meta delivers a webhook
//                 again when it got no 200 in time, and a message must reach
//                 Gladys once;
//   - `counters`  messages sent, received and failed today (widget);
//   - `webhookAt` the last webhook received from Meta (widget, diagnostic).
//
// A missing or broken file starts empty. Writes are serialized and atomic
// (temporary file + rename).
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';
// Meta retries a webhook for a few days at most; 500 ids cover far more
// than the messages of a home in that time.
const MAX_SEEN = 500;
// A home never talks to that many numbers; past it, the oldest are forgotten.
const MAX_CONTACTS = 200;

const emptyCounters = (day) => ({ day, sent: 0, received: 0, failed: 0 });

/**
 * @description The day of an instant, in UTC (counters reset at midnight UTC,
 * like the daily limits of Meta).
 * @param {number} now - The instant, in ms.
 * @returns {string} 'YYYY-MM-DD'.
 * @example
 * dayOf(Date.parse('2026-10-15T18:00:00Z')); // -> '2026-10-15'
 */
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

/**
 * @description Create the persisted state.
 * @param {object} options - Options.
 * @param {string} [options.path] - The JSON file.
 * @param {object} options.logger - Logger.
 * @param {() => number} [options.now] - Clock.
 * @returns {object} The state.
 * @example
 * const state = createStore({ logger });
 * await state.load();
 */
function createStore({ path = DEFAULT_PATH, logger, now = Date.now }) {
  let data = { inbound: {}, seen: [], counters: emptyCounters(dayOf(now())), webhookAt: null };
  let saving = Promise.resolve();

  const save = () => {
    const snapshot = JSON.stringify({ version: 1, ...data });
    saving = saving
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, snapshot);
        await rename(temporary, path);
      })
      .catch((err) => logger.warn(`Unable to write ${path}: ${err.message}`));
    return saving;
  };

  const counters = () => {
    const day = dayOf(now());
    if (data.counters.day !== day) {
      data.counters = emptyCounters(day);
    }
    return data.counters;
  };

  return {
    /**
     * @description Read the file; a missing or broken file starts empty.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const file = JSON.parse(await readFile(path, 'utf8'));
        data = {
          inbound: file.inbound && typeof file.inbound === 'object' ? file.inbound : {},
          seen: Array.isArray(file.seen) ? file.seen.filter((id) => typeof id === 'string') : [],
          counters:
            file.counters && typeof file.counters.day === 'string'
              ? { ...emptyCounters(file.counters.day), ...file.counters }
              : emptyCounters(dayOf(now())),
          webhookAt: Number.isFinite(file.webhookAt) ? file.webhookAt : null,
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Unable to read ${path}: ${err.message}`);
        }
      }
    },
    /**
     * @description Remember a received message id. False when it was already
     * there: the webhook is a retry, the message must be dropped.
     * @param {string} id - The WhatsApp message id (wamid).
     * @returns {boolean} Whether the id is new.
     */
    remember(id) {
      if (!id || data.seen.includes(id)) {
        return false;
      }
      data.seen.push(id);
      if (data.seen.length > MAX_SEEN) {
        data.seen.splice(0, data.seen.length - MAX_SEEN);
      }
      return true;
    },
    /**
     * @description A message of this number was received at this instant: its
     * customer service window opens again.
     * @param {string} waId - The WhatsApp number (digits).
     * @param {number} at - The instant of the message, in ms.
     */
    inboundFrom(waId, at) {
      if (!(data.inbound[waId] >= at)) {
        data.inbound[waId] = at;
      }
      const entries = Object.entries(data.inbound);
      if (entries.length > MAX_CONTACTS) {
        entries
          .sort((a, b) => a[1] - b[1])
          .slice(0, entries.length - MAX_CONTACTS)
          .forEach(([key]) => delete data.inbound[key]);
      }
    },
    /**
     * @param {string} waId - The WhatsApp number (digits).
     * @returns {number|null} The last message received from it, in ms.
     */
    lastInbound: (waId) => data.inbound[waId] ?? null,
    /**
     * @description Count a message of today.
     * @param {'sent'|'received'|'failed'} kind - The counter.
     */
    count(kind) {
      counters()[kind] += 1;
    },
    /** @returns {{ day: string, sent: number, received: number, failed: number }} Today. */
    counters: () => ({ ...counters() }),
    /** @param {number} at - A webhook of Meta arrived at this instant. */
    webhookReceived(at) {
      data.webhookAt = at;
    },
    /** @returns {number|null} The last webhook of Meta, in ms. */
    webhookAt: () => data.webhookAt,
    save,
  };
}

export { createStore, dayOf, MAX_SEEN };
