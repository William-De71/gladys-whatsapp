<!--
The TITLE of this pull request becomes the squash commit, then the line users
read in CHANGELOG.md and in the GitHub Release. Write it in English, as a
Conventional Commit describing the change for the user:

  feat(widget): show the throughput level of the phone number
  fix(webhook): keep the order of messages received in the same notification
  perf: read the linked contacts once per notification
  docs: explain how to create the fallback template

feat -> minor version, fix / perf -> patch, `!` or a "BREAKING CHANGE:" footer
-> breaking (a minor while the version is below 1.0.0). docs, chore, ci, test,
style, refactor and build alone publish no release. Never edit CHANGELOG.md.
-->

## What changes for the user

## How it was tested

- [ ] `npm run format:check`, `npm run lint` and `npm test` pass
- [ ] Tried in Gladys with a real WhatsApp Business account (Gladys version: …, test number or real number, with or without Gladys Plus)
- [ ] The four docs (`docs/en.md`, `fr`, `de`, `es`) and READMEs are up to date
