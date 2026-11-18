# Countdown and Pro passport — product acceptance

Source: PR #1496, following preflight commit
`8b867210f6d35c4f0408b753e14711e41e33194b`. Actual production React consumers,
the real shell, Router, Query and generated transport render against synthetic
HTTP fixtures. These are not generated UI images. Runtime-source fingerprints
at capture are recorded in `source-hashes.json`; the documentation commit does
not change those runtime files.

## Behavioral evidence

Nine Chromium journeys passed: 360 Light, 390 Dark, 430 Light, 1280 Dark,
320 reflow and 390 Dark with 200% text; Free Profile; failed write; and hidden
upcoming module. Reduced motion is enabled. The main journey uses the keyboard
to toggle the actual shared PreferenceSwitch, waits for server confirmation,
returns through primary navigation, observes the absolute-date countdown without
its duplicate agenda row, opens the Plan and returns to Wir. It then opens Pro
Profile, follows a count to the canonical filtered Timeline and returns. Axe
checks the changed passport. Free does not request Pro aggregates; failed writes
remain unchanged with recovery and no success claim. The existing Profile
preferences, private notes, partner and Pro information remain in composition.

The generated reference's synthetic itinerary, stock portraits and extra controls
are not runtime features. Real captures use repository-owned demo imagery and
synthetic people/content. No personal photograph or live relationship data is
committed. Full-page captures retain viewport-fixed navigation at its actual
viewport position; that is screenshot behavior, not a second in-content toolbar.

## Captures

- [Wir, 360 Light](evidence/anticipation-wir-360-light.png)
- [Plan control, 390 Dark](evidence/anticipation-plan-390-dark.png)
- [Pro Profile, 390 Dark](evidence/passport-pro-390-dark.png)
- [Pro Profile, 1280 Dark](evidence/passport-pro-1280-dark.png)
- [Pro Profile, 200% text](evidence/passport-pro-390-dark-large-text.png)
- [Free Profile](evidence/passport-free.png)

## Technical checks and limits

The final source passes 2,207 Web tests (two pre-existing skips), the 13 focused
production-consumer regressions, TypeScript, production build, token/PWA and
Capacitor foundation checks, formatting and lint (existing warnings only).
Backend focused unit/contract/entitlement tests, strict mypy and complete Ruff
checks pass. The local full Backend unit run initially had 1,013 passes and one
environment-only failure because the injected SOCKS proxy needed `socksio` even
when constructing a synthetic S3 adapter. Installing that test-environment-only
package, outside the repository, makes that unchanged test pass. The complete rerun passed **1,014 tests**; no product dependency or test was changed.

PostgreSQL/HTTP cases cover bounded special-event selection beyond the ordinary
agenda limit, calendar-day conversion, ineligible Plans, shared If-Match writes,
Free/expired/wrong capability denial before aggregation, shared-only counts,
couple/cross-Space authorization and duration preference. Local PostgreSQL/Docker
are unavailable, so these require the ordinary hosted PostgreSQL gates and are
not counted as local passes. The committed API/client is regenerated with the
official 7.24.0 JAR/configuration; the pinned hosted generator drift gate remains.

No new native capability is introduced. Physical APK installation/data continuity,
TalkBack, OS/OEM behavior and deployment/provider acceptance are not established
by these shared-Web fixtures. APK and Cloud channel publication are separate.
