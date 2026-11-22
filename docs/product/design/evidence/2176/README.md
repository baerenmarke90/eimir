# #2176 mail-requested state: design evidence

- `mailrequested-mockup.html`: Compact (390 px) mock-up of the mail-requested state in Light and Dark, approved by the Product Owner on 2026-11-22 together with the German wording ("Neuen Link anfordern", "Andere Adresse verwenden", "Zur Anmeldung", and the link-not-usable snackbar). Colours are copied from `web/src/theme.css`; it is a mock-up, not a render of the app.
- Rendered evidence of the implemented result is produced by the Playwright spec `a requested link can be sent again or restarted with another address (#2176)` in `web/e2e/tests/cloud-onboarding-entry.spec.ts` (Compact 360/390/430, Light/Dark, reduced motion, large text, Expanded) and attached to the CI run.
- Baseline: `origin/main` 1ebb920db, screen `IdentityEntry` modes `magicLinkRequest`, `signupRequest`, `recoveryRequest`.
