// -----------------------------------------------------------------------------
// Entry point of the WhatsApp external integration.
//
// Talk to Gladys on WhatsApp, through the official WhatsApp Business Cloud API
// of Meta:
//   - outgoing: the messages of Gladys reach the WhatsApp number of each
//     linked user (text, image), through an approved template outside the
//     24-hour customer service window;
//   - incoming: the messages of linked users reach the brain of Gladys, through
//     the webhook of Meta relayed by Gladys Plus;
//   - scene trigger "message received" and "message not delivered", scene
//     action "send a message template", a dashboard widget (quality, limit,
//     messages of the day, reception).
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the WhatsApp integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
