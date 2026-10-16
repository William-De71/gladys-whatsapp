# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for WhatsApp, on the official
WhatsApp Business Cloud API of Meta (Graph API, `graph.facebook.com`): a
Node.js service (Node 22+, ESM, no build step) that runs in its own sandboxed
Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. Manifest type `communication`, bidirectional
(`messaging: { receive: true }`). Outgoing messages call the Cloud API;
incoming ones arrive through the `meta` webhook (sync mode) relayed by Gladys
Plus. Transport: cloud only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(): send, webhook,
                        link codes, 24-hour window and fallback, scene action,
                        widget, buttons, diagnostic
src/graph-api.js        Cloud API client (Graph API v25.0), error codes -> reasons
src/webhook.js          verification GET of Meta, notifications -> messages/statuses
src/store.js            /data/state.json: last message per number (window), seen
                        message ids, counters of the day, last webhook
src/events.js           scene trigger payloads, once-per-run failure events
src/widgets.js          the `status` dashboard widget
src/config.js           configuration (ids, token, verify token, template, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **Every key users store is forever**: the keys of `config_schema`, of the
  `actions` and their fields, of the `meta` webhook (its URL ends with it and is
  registered at Meta), of the scene triggers (fields, options, variables), of
  the scene action (fields, outputs) and of the widget. `test/structure.test.js`
  compares them to `test/fixtures/manifest.baseline.json`: never update the
  baseline to make a test pass without a documented migration. The contact id
  is the WhatsApp number in digits (`wa_id`): never change its format.
- **Answer Meta at once.** The webhook handler returns 200 immediately and
  processes the notification afterwards, in order (`queue`). Meta retries what
  is not acknowledged: the store drops the message ids already seen.
- **No signature check is possible**: Gladys Plus relays no header, so
  `X-Hub-Signature-256` never reaches the integration. Only the configured
  phone number id is accepted, and only linked contacts reach the brain;
  strangers get no answer. Never forward a message of an unlinked number.
- **24-hour window**: free text only within 24 hours of the last message of the
  user (`store.inboundFrom`); outside, the fallback template, with the text as
  its only body parameter (no new line, tab or 4 spaces: `templateParameter`).
  A late `failed` status with 131047 resends through the template once.
- **No scene event caused by a scene action**: a failure of a template sent by
  `send_template` never fires `message_failed`. `message_failed` fires on the
  first failure of a number, then only after a success.
- **Diagnostic** logs at the info level (Gladys does not pass `DEBUG` or
  `LOG_LEVEL` to the container): never the token, the Open API key, a full
  webhook URL or a full phone number (`maskNumber`, `hostOf`).
- **The container rootfs is read-only.** Write only under `/data`. Never log
  the access token; it only travels in the `Authorization` header.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): a widget button
  with a form would need 5.2.0. Transport: `["cloud"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (a local server on 127.0.0.1 at
  most).
