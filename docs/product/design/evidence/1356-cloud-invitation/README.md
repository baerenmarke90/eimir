# Cloud invitation email regression (#1356)

Baseline: `599e6dd29380c4c79bbe9c8e5fb34ac4e78c227b`. Captured on 2026-10-18 from
this PR's local Web implementation in Chromium, with synthetic Accounts and
mocked API responses. No real recipient, mailbox proof or invitation is shown.

The existing IdentityEntry composition, localized text, fields, pending/error
presentation, semantic tokens and mail confirmation remain unchanged. This is
a request-dispatch and authenticated-continuation repair, with no new visual
composition or native capability. The preflight and reuse/business review are
recorded in #1356.

- [Compact, 390 × 844](mail-confirmation-compact.png)
- [Expanded, 1280 × 900](mail-confirmation-expanded.png)

Both captures were visually inspected: the confirmation is readable and fits
the existing composition without clipped content. No theme-sensitive styling
was changed; these captures are Light only.

The browser regression exercises invitation entry, email request with the
invitation in its body, neutral confirmation, a simulated mailed callback with
the invitation fragment, history cleanup, authenticated acceptance and entry
into the shared Space without creating another. The existing-account journey
and existing non-Cloud entry remain covered. The invitation does not enter
localStorage. All five Cloud onboarding browser cases pass without retries.

The Web suite passes 1861 tests with one existing skip. Focused backend mail
and policy tests pass 32 cases; affected Python sources pass Ruff and mypy.
The source OpenAPI matches the real ASGI schema. The pinned generator version
reproduces all 680 baseline client files exactly before regeneration; the new
client was generated with that same version and configuration. Web build,
TypeScript, lint and formatting pass.

Limits: browser API responses are mocked. SMTP acceptance, delivery to an
actual recipient, PostgreSQL integration, deployment and an updated Android
test APK are not established by this local evidence. Existing backend
Membership authorization remains authoritative. GitHub CI must pass before
merge; this evidence is not release or final Product Acceptance.
