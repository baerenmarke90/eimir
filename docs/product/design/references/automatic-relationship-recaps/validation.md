# Automatic relationship recap implementation evidence

Owner: #1528. Baseline: main `1468e0a6e66eb5bd7b9192bf65ac357d8351b4d0`.
The generated preflight reference was linked in the owning issue before UI code.
Final integration includes main `efea8364d9be5e2b7808cb33665ab725e9a0264e`
(the journal, Today/composer, Places/Lists and Timeline follow-ups); its source-title,
anticipation, source navigation and browser acceptance changes are preserved.

## Product evidence

The screenshots in `evidence/` show the actual React application with synthetic
shared records and a generated test-only lake photograph. Production only shows
reauthorized source material; it never uses this photograph as a fallback.

- Compact 360/390 px Light and 430 px Dark: month/year tabs, editorial library,
  focused reader and canonical source navigation with restored reader page.
- Expanded 1280 px Light/Dark: the same hierarchy adapted to the reading width.
- 200% text at 390 px: no horizontal overflow; editing remains usable.
- Saved shared reflections and a separate private draft; pending background work.
- Reduced motion in representative visual runs. Next/previous controls remain
  explicit and reachable; navigation is not swipe-dependent.

Browser behavior covers Open → choose year/month → read → source → return to the
same page, selection save/conflict/reload without losing choices, private draft
save, explicit share, saved-edition freeze and author withdrawal. Free reads
retained editions without scheduling composition. Empty periods show no invented
source/media. A failed offline write retains the text and dirty-task protection.
Axe passes for the library/reader in the representative viewport/theme matrix.
The original next-occasion/statistics flows remain available through the named
secondary disclosure and preserve its expanded route context on return.

## Validation performed

- Real PostgreSQL: eight recap integration cases including tenant/private-source
  exclusion, shared identity, optimistic conflicts, idempotent generation,
  full-year diversity, saved/downgraded reads, source privacy invalidation and
  encrypted personal-transfer round trip with partner-draft exclusion.
- Account deletion lifecycle and existing transfer/encryption/archive regression
  selections pass (10 and 41 tests respectively in the combined targeted runs).
- Full backend unit suite: 1,046 passed; final composition/local-model edge-case
  selection: 15 passed. No database tests were counted as passed while skipped.
- Alembic upgrade from an empty disposable PostgreSQL database to 0093 and the
  canonical Alembic metadata comparison pass with no new upgrade operations.
- Backend Ruff check/format and strict mypy (319 modules) pass. The live ASGI
  OpenAPI contract and generated TypeScript client drift checks pass.
- Full Web suite: 2,306 passed and two existing skips in the first broad run;
  four concurrent-run failures were diagnosed (three timeouts, one asynchronous
  chart wait). All four affected files then passed without increased timeouts,
  one worker, 58 tests. Final navigation/profile/More selection: 31 passed.
- New browser suite: ten cases; original relationship-reflection browser suite:
  14 retained cases. Seven original long journeys exceeded their 30-second budget
  during concurrent full-suite load; all seven passed in an isolated single-worker
  rerun without timeout changes. A year/month transition assertion now waits for
  the selected month's actual heading rather than clicking a stale year cover.
  The additional pending-state case uses the existing UiState status text, not a nonexistent
  heading. These harness corrections preserve behavioral assertions.
- Production Web build, design-token/PWA checks, scoped lint, browser inventory,
  38 private-channel publication contracts and the rendered AI Compose validate.

## PR CI corrections

The shared endpoint matrix now covers all nine recap operations, including
foreign/absent/malformed resources and required optimistic headers. The focused
selection passes 52 cases in both normal and required-encryption modes against
real PostgreSQL. The recap grant is scoped to recap scenarios so other domain
fixtures retain their Free-tier behavior.

The existing profile nickname and private-note journeys caught overflow from the
new passport entry at narrow widths and 200% text. Its flex content can now shrink
and wrap, with no clipping or relaxed assertions. Both existing journeys are
rerun unchanged at Compact and Expanded sizes.

## Limits

Local QA reused an available Python 3.13 dependency environment and cached Node
22/Playwright containers. The repository's exact locked CI toolchain remains the
release authority. The actual Qwen model was not downloaded or benchmarked, and
no physical Android-device validation or real operator deployment was performed.
Model HTTP/schema/failure/resource-option behavior is tested; language quality,
cold-start latency and RAM on the operator's server remain to be measured.

The standard official Ollama image includes accelerator libraries even though
execution is CPU-only. No GPU toolkit/device, Python ML environment or additional
queue/vector services are installed. The 4 GiB limit is an operator ceiling, not
a measured requirement; the approximately 1.4 GB model is additional to the image.
Deployment commands preserve the supplied instance's existing networks, data and
secret expressions. Old application image digests do not contain this feature;
new channel images must follow merge and required main checks.
