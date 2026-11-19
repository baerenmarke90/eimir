# Soft composer runtime evidence — 2026-11-10

Validated source: `9de71192fcbaf27af5558b79c4ddf8c745e3325a`, based on
main `f334067cff7b2c7638571a3fd50db52ddcaf8633` and the existing #1727
correction `f90d356b703e4d73aa8636f52080a078f8f9de27`. These are runtime
Chromium captures of the production React UI with synthetic HTTP fixtures.
The subsequent evidence commit changes documentation only.

## Reviewed composition

| Surface | Representative captures |
| --- | --- |
| Diary, both source choices | [360 Light](shell-soft-composer-360-light.png), [390 Dark](shell-soft-composer-390-dark.png), [430 Light](shell-soft-composer-430-light.png) |
| Expanded and large text | [1280 Dark](shell-soft-composer-1280-dark.png), [320 at 200%](shell-soft-composer-320-light.png) |
| Memory editing | [390 Dark](shell-soft-composer-memory-edit-390-dark.png) |
| Plan creation | [360 Light](shell-soft-composer-plan-create-360-light.png), [1280 Dark](shell-soft-composer-plan-create-1280-dark.png) |
| Plan editing | [360 Light](shell-soft-composer-plan-edit-360-light.png), [1280 Dark](shell-soft-composer-plan-edit-1280-dark.png) |
| HeartMoment capture | [390 Light](heart-feeling-create-390-light.png), [390 Dark](heart-feeling-create-390-dark.png) |
| HeartMoment editing | [390 Light](heart-feeling-edit-390-light.png), [390 Dark](heart-feeling-edit-390-dark.png) |
| HeartMoment reading | [1440 Light](heart-feeling-reading-1440-light.png), [1440 Dark](heart-feeling-reading-1440-dark.png) |
| Large-text feeling choices | [320 Light, German](heart-feelings-large-320-light-de.png), [320 Dark, English](heart-feelings-large-320-dark-en.png) |
| Populated gallery | [Ten-photo draft at 390](compact-photos-390.png) |

Title/prose lead the shared writing/media surface. Source choices retain their
native buttons, format hints, contextual icons, availability and Pro semantics.
Existing edit navigation, management actions, gallery controls, audience,
feeling, date, Places, tags and shared Lists remain available. Full-page
captures include the fixed navigation and keyboard-focus state present during
the recorded journey. Screenshot hashes and originating journeys are listed
in [manifest.json](manifest.json).

## Behavioral validation

All **191 tests in nine complete browser specs** passed locally using the
locked Playwright/Chromium runtime, with no skipped cases or retries:

- `create-surface-visual-checks`, `f2-task-boundaries`;
- `heart-moment-create-product-reference`, `heart-moment-reading`;
- `media-planning-corrections`, `memory-create-defaults`;
- `planning-wish-completion-continuation`, `polish-people-photo-sources`;
- `private-location-and-capture-tags`.

These journeys exercise open, write/select, save, read/reload, edit and return;
draft/discard/recovery, failed saves and deliberate retry; gallery cover,
sorting, sensitivity and retained selections; external-source cancellation,
native file-picker cancellation, keyboard focus restoration and all six
HeartMoment feelings in both themes. The five integrated source-choice cases
also assert visible 1px field/button boundaries in forced-colors mode, axe,
reduced motion, 360/390/430/1280 layouts and 320px at 200% text.

The eight relevant unit/component/layout specs passed **113 tests**. A prior
concurrent run timed out in two 5-second cases under local build/browser load;
the complete set passed with one worker and unchanged timeouts/assertions.
Application and fixture typechecks, production build including token/legal/
localization/PWA checks, formatting, lint, Capacitor foundation, 38 browser
planning regressions and browser inventory also passed. Existing lint warnings
remain unrelated to this correction.

Physical-device keyboard/gesture and native-wrapper acceptance are outside
this Web presentation change. No native platform capability was modified.
Final published-head CI and merge status are recorded in #1727.
