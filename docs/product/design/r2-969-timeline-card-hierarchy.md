# R2 follow-up — Timeline card chrome and metadata hierarchy

**Owner:** [#969](https://github.com/baerenmarke90/eimir/issues/969), a focused follow-up to R2 ([#966](https://github.com/baerenmarke90/eimir/issues/966), [r2-momente-timeline.md](r2-momente-timeline.md)).
**Status:** implemented and under review. This record does not accept the result on the Product Owner's behalf.

## Baseline and boundaries

Branch `feat/969-timeline-card-hierarchy` starts at `d61542d7` (`origin/main`, R2 merged). The work stayed in a separate worktree because R3 / Planen was being built in parallel in the primary checkout. No Planen file, route, stylesheet or behaviour was changed. Backend, data model, Timeline ordering, filters, search, pagination, create flow and return continuity are untouched. Discover keeps its own cards; it is not part of this issue.

## Hierarchy

Each Timeline card now reads in this order: photo (when present), title or words, then one quiet metadata row with date, author, and (where relevant) visibility and photo count. Nothing precedes the content.

| Before | After (Web) | After (Android) |
| --- | --- | --- |
| `ERINNERUNG` pill on every Memory | No marker; Memory is the default entry and keeps the plain Timeline dot | No marker |
| `HERZMOMENT` pill (plus `♥` on Android) | Heart-shaped Timeline node; existing soft tint kept | Small heart glyph before the words; existing tint kept |
| `MEILENSTEIN` pill and a 4 px accent stripe inside the card | Ringed-star Timeline node; stripe removed | Ringed-star glyph before the title; existing restrained border kept |
| Shared-visibility pill (`story.shared`; Web: Heart Moments; Android: every card) | eimir. rings icon in the footer, Heart Moments only | Same rings icon in the metadata row, Heart Moments only |
| Author prose (`story.byAuthor`) | Avatar and first name | Initials mark and name |
| `2 Fotos` text | Photo icon and count, named `2 Fotos` | Photo icon and count, named `2 Fotos` |

Kind is shown by shape (dot, heart, ringed star), not colour alone. Web keeps the kind in each card link's accessible name (`Herzmoment: …`) and describes the link with its footer through `aria-describedby`. On Android the glyph's content description is merged into the clickable card for TalkBack.

**Visibility rule.** The Story contract only ever returns shared items: Memories and Milestones are shared by construction, and only shared Heart Moments enter the Story (see `storyItemPresentation`). A shared icon on every card would say nothing, so it appears only on Heart Moments, where sharing was a real choice. Both platforms follow the same rule. The footer also supports the private lock icon (`visibilityPrivate`), but the current contract never produces a private Story item.

## Metadata footer (Web)

The footer is one `flex-wrap` row: the date comes first and the author/visibility/photo group follows. When they don't fit side by side (narrow screens, large text), the group moves to a second row and starts at the left edge. Nothing uses `nowrap` on text that can grow, and nothing is cut with an ellipsis. A long name wraps at its own break points next to the avatar and only drops below it when a single segment no longer fits. Date and icon metadata use the secondary text token: the muted token measured 3.53:1 on the card surface in axe, below AA for text this small. The compact stacked-column rules in `StoryProductPages.css` and `product-reflow.css` were removed, and the footer's single base rule (#795) stays its only owner.

## Month heading and app bar (Web)

The shared app bar is sticky, 95% opaque, and its real height varies: 64 CSS px at 390 px, 72–73 px on wider windows, 108 px at 200% text, 189 px at 320 px with 200% text, and about 245–380 px under 200% browser zoom. `--topbar-height` is a fixed 72 px, so it can't be used as an offset. Two things together make the heading behave deliberately:

1. **Pinned heading, measured offset.** `useStickyTimelineMonths` measures the rendered bar with a `ResizeObserver` and pins each Timeline month heading directly below it on an opaque band. The next month hands over by pushing it out. If the bar takes more than 20% of the viewport (large text or zoom), pinning is turned off and headings stay ordinary content, so reading space is never lost to a second band. Focused cards get a matching `scroll-margin-top`, so keyboard focus is never hidden under either band.
2. **Opaque bar over Momente.** While month-grouped Momente content is on screen, the bar is backed by the page background, so a handed-over heading can't show through it. The bar's tint, height and behaviour are unchanged, and other destinations (including Planen) keep their translucent bar. This is verified in the spec.

The year-detail archive uses the same month sections and gets the opaque bar, but its headings stay ordinary content. Android has no top app bar over the Timeline (content starts below the system inset), so this problem does not exist there.

## Validation

- **Web:** `npm run typecheck`, `npm run lint` (0 warnings, matching the baseline), `npm run format:check`, `npm run tokens:check` and `npm run build` pass. `npx vitest run`: 867 passed, 1 pre-existing skip. New `StoryListHierarchy.test.tsx`; `StoryList.test.tsx`/`storyPresentation.test.ts` updated.
- **Web browser:** the new `r2-timeline-card-hierarchy.spec.ts` covers no pills, no stripe, the kind nodes, named icons, first child at the card padding, footer and title containment at 390/320 px and 200% text, pinned and handed-over headings, the zoom fallback, focus clearance, Planen's bar unchanged, and axe at WCAG 2.2 AA in light and dark. The existing Timeline, Story years, Discover, featured metadata, i18n names, R2 evidence and F2 task-boundary specs were re-run one file at a time with `--workers=1`. `story-timeline-attachment-meta.spec.ts` now asserts the wrapping row instead of the old stacked column.
- **Android:** `StoryScreenSemanticsTest` asserts no printed kind or visibility label, named kind glyphs merged into the openable card, shared visibility only on Heart Moments, a named photo count, the author without prose, and (with native graphics) a long author name that wraps inside the card at 320 dp and 2× font. Full `testDebugUnitTest`, `lintDebug` and `assembleDebug` pass; see the PR for counts.
- **Language audits:** `tools/ci/engineering_language_audit.py` and `tools/ci/documentation_language_audit.py` pass.

## Evidence

`evidence/r2-969/before/` was captured on unmodified `origin/main` and `evidence/r2-969/after/` on this branch, with identical fixtures: a long partner name, 3/1/0 photos, all three kinds, three months.

- Web `01` full Timeline 390 px, `12` Expanded 1280 px, `02`–`05` Memory, Memory with full metadata, Heart Moment and Milestone crops (2×), `06` 320 px, `07`/`08` 200% text, `09`/`10` month heading (before: crossing the bar; after: pinned and handed over), `11` dark. On `origin/main` the spec stops at its first failed check, so `before/` has no `08` or `10`.
- Android `android-timeline-{390-light,390-dark,320-light,320-font-200pct}.png`: Robolectric native-graphics renders of the production `StoryScreen` composable, in `de-DE`.

## Known limitations

- Android evidence is composable renders, not a device or emulator session. No device was attached, and the debug proof activity only provides Memories. Card composition and semantics are what changed, and both are covered, but no on-device TalkBack pass was recorded.
- On Web at 320 px with 200% root text (about 160 px of layout width, beyond the WCAG 1.4.10 reflow target), long words in titles, dates and the existing month heading break mid-word as a last resort. Nothing clips or overflows horizontally (`08-timeline-320-200pct-text-full.png`).
- At 320 dp with 2× font, Android may force-split a single very long hyphenated surname. This is the platform line breaker's last resort; nothing overflows.
- Web announces the kind for every card, including `Erinnerung:` for Memories (the existing link-name contract). Android names only the special kinds through their glyphs.
