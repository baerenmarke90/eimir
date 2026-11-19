# Composer writing surface

## Product Owner request and baseline

On 2026-11-13 the Product Owner reported that the title and text fields when
creating and editing Moments, Plans and Wishes feel loveless, while the
Milestone form is solved more nicely. Reviewed main:
`12c650ebf Merge pull request #1806`.

The page-as-composer decision (#1730) removed every surface behind title and
prose, so the fields read as bare text on the page background. The Milestone
form keeps a filled surface, so it invites writing. This refinement gives the
page composers one calm authored surface without reverting #1730's page-first
composition.

## Composition

- Title and prose share one borderless surface: `--color-surface`,
  `--radius-card`, `--space-4`/`--space-5` padding. Contrast with
  `--color-background` marks the boundary (zero-frame rule, #1574).
- A one-pixel `--color-border-subtle` divider separates title from prose.
- Titles use the display role with a short italic prompt; prose uses a warm,
  domain-specific placeholder (`m5s3.plan/wish.titleHint`,
  `descriptionPlaceholder`). Native labels are unchanged.
- Keyboard focus keeps the existing focus ring; the surface lifts to
  `--color-surface-overlay` while focused.
- HeartMoment mixes the surface with its feeling-colored ground.
- Applies to Plan create/edit, Wish create/edit, Diary/Memory create/edit and
  HeartMoment create/edit through the `composer-authored-surface` class.
  The Milestone form is unchanged.

## Evidence

Runtime captures at 390 px, API-mocked fixture: `before-plan-create-390-light.png`
(previous state) and `{plan,wish,memory}-create-390-{light,dark}.png`.
The first design preflight was an HTML mockup built from the repository tokens;
no image-generation tool was available when it was made.
