# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.1] - 2026-10-24

### Security

- **security:** build the image on Node.js 24.22.1 or later ([bf23fd1](https://github.com/William-De71/gladys-whatsapp/commit/bf23fd1ab8dd7ab608822819fd459c8ebd891d47))

## [0.1.0] - 2026-10-16

### Added

- Two-way WhatsApp channel on the official WhatsApp Business Cloud API of Meta: each Gladys user links their WhatsApp number with a link code, their messages reach the brain of Gladys, and the answers and notifications of Gladys come back on WhatsApp (text, and images with a caption).
- Reception through Gladys Plus: the integration answers the webhook verification of Meta, drops duplicated notifications, marks the messages as read, and can point the webhook of the WhatsApp Business account at the Gladys Plus URL by itself.
- The 24-hour customer service window: outside of it, the messages of Gladys go through an approved fallback template, also when Meta reports the window closed after the fact.
- A "Link a number without Gladys Plus" button: send-only notifications through the fallback template, without Gladys Plus.
- Scene triggers "WhatsApp message received" (type, button payload, exact text) and "WhatsApp message not delivered" (with its reason), and a "Send a WhatsApp template" scene action with body parameters.
- A dashboard widget: quality rating and messaging limit of the number, messages of the day, status, reception and linked contacts.
- "Test the connection", "Register the webhook" and "Diagnostic" buttons; the diagnostic masks the token, the Open API key and the phone numbers.
- English, French, German and Spanish everywhere: settings, replies, widget, scenes and documentation.

[0.1.1]: https://github.com/William-De71/gladys-whatsapp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-whatsapp/releases/tag/v0.1.0
