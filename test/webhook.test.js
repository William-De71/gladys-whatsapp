import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyChallenge, parseNotification, textOf, payloadOf } from '../src/webhook.js';
import {
  notification,
  textNotification,
  statusNotification,
  ALICE,
  NOW,
  PHONE_NUMBER_ID,
} from './helpers/fixtures.js';

test('answers the verification of Meta with the challenge, as plain text, for our token only', () => {
  const query = {
    'hub.mode': 'subscribe',
    'hub.verify_token': 'tok',
    'hub.challenge': '1158201444',
  };
  assert.deepEqual(verifyChallenge(query, 'tok'), {
    status: 200,
    contentType: 'text/plain',
    body: '1158201444',
  });
  assert.equal(verifyChallenge(query, 'other').status, 403);
  assert.equal(verifyChallenge(query, '').status, 403);
  assert.equal(verifyChallenge({ ...query, 'hub.mode': 'unsubscribe' }, 'tok').status, 403);
  assert.equal(verifyChallenge({ ...query, 'hub.challenge': '' }, 'tok').status, 403);
  assert.equal(verifyChallenge(undefined, 'tok').status, 403);
});

test('reads a text message with its sender, profile name and time', () => {
  const { messages, statuses } = parseNotification(textNotification(ALICE, 'Turn on the lights'));
  assert.equal(statuses.length, 0);
  assert.deepEqual(messages[0], {
    id: `wamid.in-${ALICE}-18`,
    from: ALICE,
    name: 'Alice',
    phoneNumberId: PHONE_NUMBER_ID,
    at: Math.floor(NOW / 1000) * 1000,
    type: 'text',
    text: 'Turn on the lights',
    payload: null,
    latitude: null,
    longitude: null,
    emoji: null,
  });
});

test('reads buttons, interactive replies, locations, captions and reactions', () => {
  const body = notification({
    contacts: [{ profile: { name: 'Alice' }, wa_id: ALICE }],
    messages: [
      {
        from: ALICE,
        id: 'w1',
        timestamp: '1',
        type: 'button',
        button: { text: 'Open', payload: 'OPEN_GATE' },
      },
      {
        from: ALICE,
        id: 'w2',
        timestamp: '2',
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'yes', title: 'Yes' } },
      },
      {
        from: ALICE,
        id: 'w3',
        timestamp: '3',
        type: 'location',
        location: { latitude: 48.85, longitude: 2.35, name: 'Home' },
      },
      {
        from: ALICE,
        id: 'w4',
        timestamp: '4',
        type: 'image',
        image: { id: 'm1', caption: 'Look' },
      },
      {
        from: ALICE,
        id: 'w5',
        timestamp: '5',
        type: 'reaction',
        reaction: { message_id: 'x', emoji: '👍' },
      },
      { from: ALICE, id: 'w6', timestamp: '6', type: 'unsupported' },
      { from: ALICE, type: 'text', text: { body: 'no id' } },
    ],
  });
  const { messages } = parseNotification(body);
  assert.deepEqual(
    messages.map(({ type, text, payload }) => [type, text, payload]),
    [
      ['button', 'Open', 'OPEN_GATE'],
      ['interactive', 'Yes', 'yes'],
      ['location', null, null],
      ['image', 'Look', null],
      ['reaction', null, null],
      ['other', null, null],
    ],
  );
  assert.equal(messages[2].latitude, 48.85);
  assert.equal(messages[2].longitude, 2.35);
  assert.equal(messages[4].emoji, '👍');
  assert.equal(
    textOf({ type: 'interactive', interactive: { list_reply: { title: 'Row' } } }),
    'Row',
  );
  assert.equal(payloadOf({ type: 'interactive', interactive: { list_reply: { id: 'r1' } } }), 'r1');
  assert.equal(textOf({ type: 'audio' }), null);
});

test('reads the statuses of sent messages, with the error of a failed one', () => {
  const { statuses } = parseNotification(
    statusNotification('wamid.out1', 'failed', ALICE, {
      code: 131047,
      title: 'Re-engagement message',
    }),
  );
  assert.deepEqual(statuses[0], {
    id: 'wamid.out1',
    status: 'failed',
    recipient: ALICE,
    phoneNumberId: PHONE_NUMBER_ID,
    at: Math.floor(NOW / 1000) * 1000,
    error: { code: 131047, title: 'Re-engagement message', details: 'Re-engagement message' },
  });
  assert.equal(parseNotification(statusNotification('w', 'read', ALICE)).statuses[0].error, null);
});

test('ignores anything else: broken JSON, another object, another field', () => {
  const empty = { messages: [], statuses: [] };
  assert.deepEqual(parseNotification('{not json'), empty);
  assert.deepEqual(parseNotification(null), empty);
  assert.deepEqual(parseNotification(JSON.stringify({ object: 'page', entry: [] })), empty);
  const other = JSON.parse(textNotification(ALICE, 'x'));
  other.entry[0].changes[0].field = 'message_template_status_update';
  assert.deepEqual(parseNotification(JSON.stringify(other)), empty);
  // An already parsed body works too.
  assert.equal(parseNotification(JSON.parse(textNotification(ALICE, 'x'))).messages.length, 1);
});
