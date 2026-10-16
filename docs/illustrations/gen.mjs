// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The `status` widget of a made-up home (fixed date): a verified business
// number with a high quality rating, a few messages of the day, the reception
// through Gladys Plus active and two linked contacts.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildStatusWidget } = await load('src/widgets.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Friday 16 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-16T18:00:00Z');
const MINUTE = 60000;

const phone = {
  id: '106540352242922',
  display_phone_number: '+33 1 23 45 67 89',
  verified_name: 'Maison Dupont',
  quality_rating: 'GREEN',
  status: 'CONNECTED',
  whatsapp_business_manager_messaging_limit: 'TIER_250',
};

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    status: buildStatusWidget({
      phone,
      configured: true,
      counters: { sent: 14, received: 9, failed: 0 },
      webhooksAvailable: true,
      webhookAt: NOW - 4 * MINUTE,
      contacts: 2,
      language,
      now: NOW,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
