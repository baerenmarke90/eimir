# Weekly AI insights and voluntary recommendations

## Authorization and preflight

The PO explicitly authorized this extension after the discussion of deeper multiweek observations, general recommendations and feedback. This extends PR #1547; merge/release remains outside the task.

Reviewed main: `ef2c412a6c5fbdb253efe746066831faeece1638`; implementation baseline: `9d2a6bd55311ad4045f08e833b2b96d48688068f`. Reviewed the actual Eure Woche screen, DailyInsightsPage/Views/Model, Daily Check-in reveal projection and optional local recap inference. The existing period picker, three insight destinations, people, Vibe/Energy charts, observations, recap action and app navigation remain.

[Generated whole-destination Compact reference](weekly-ai-preflight.webp), produced with the built-in imagegen skill before UI implementation. Prompt: preserve the current blue/periwinkle Eure Woche composition and existing functions; add an optional multiweek insight beneath the charts, a voluntary recommendation, private feedback and clear data coverage. The illustrated additional bars are composition guidance, not new measured values or a new chart requirement. Only existing canonical charts ship.

## Mobile Interaction Contract

- Outcome: understand supported patterns in jointly visible values over eight weeks and choose an optional shared activity or conversation prompt.
- Product Reference v1 R5 governs. Reuse existing insight sections, EimirIcon, buttons, semantic typography/surface/motion tokens and ProblemState. Avoid nested cards, scores and administrative layouts.
- Entry: one explicit generation action within Eure Woche; no model request during ordinary rendering, period navigation or background refresh.
- Content: at most three supported observations and two curated recommendations. Existing factual charts remain primary. Show actual source period and sample coverage; sparse data yields explicitly general suggestions.
- Compact: stacked reading flow, reachable controls, 44px targets, feedback wraps at 320px/200% text. Expanded remains a bounded reading column.
- Feedback is the caller's preference, not a joint vote or relationship score. Explain that it affects the caller's future suggestions. Both partners retain independent control.
- Loading retains context; disable duplicate submission. Errors allow explicit retry. Offline never queues or automatically replays generation or feedback. Invalid/unavailable inference uses a transparent deterministic result.
- Known context, period, entitlement or permission changes hide stale results. Revalidate on foreground return; active result polling uses the existing authorized read boundary. Reduced motion needs no decorative animation.

## Evidence and generation contract

The backend computes descriptive observations over the selected week and the preceding seven weeks, capped at the authoritative current Space day. Only dates with comparable own and VISIBLE partner values enter each dimension's calculation. Hidden participation, raw notes, private text, photos, names and locations never enter the model packet.

Supported observations include current joint entry coverage, supported week-to-week energy changes, repeated weekend/weekday energy differences and differing Vibe selections. Group comparisons require minimum paired samples and multiple weeks. Missing days remain missing; no score, diagnosis, cause, personality label or claim about relationship quality is derived.

The model selects and orders IDs from the current computed observation set and a versioned editorial recommendation catalog. It cannot provide arbitrary prose, numbers or new factual claims. The client renders the selected canonical observations and catalog entries through localization. Schema validation and explicit allowlist/duplicate checks reject invented identifiers. This provides deeper authorized aggregation and contextual selection while keeping facts and recommendation wording reviewable.

Reuse the existing operator-configured local Ollama endpoint/model. Primary references checked: [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) and [chat API](https://docs.ollama.com/api/chat). No new provider, model download, runtime dependency, user key or technical setup. Refactor the existing bounded transport only where needed; preserve recap behavior.

Generation has bounded input/output, timeout, concurrency and per-Space admission. Sparse evidence skips inference. Recompute authorization, capability and the evidence revision after inference; reject a changed context rather than return an obsolete result. No prompts, outputs or daily values enter logs.

## API, persistence and lifecycle

- Authorized GET preview returns current observations, eligible catalog entries, caller-owned feedback and an opaque evidence revision; no model call.
- Explicit POST generation requires that revision, uses fresh authorized evidence and returns selected IDs plus AI/fallback provenance. No stored generated analysis or persistent sensitive client cache.
- Idempotent per-recommendation PUT stores only a bounded catalog ID and the caller's helpful/not-fitting preference; clearing a preference remains available without Pro. Independent keys cannot overwrite each other's feedback. Concurrent writes to the same key use last accepted intent.
- Feedback is Space/Account scoped, cascades with Space/Account deletion and is included in the owner's export. Partners cannot inspect or change each other's choices. Personal restore validates the six known catalog/rating values and rejects duplicate keys; additive import preserves any current target preference. The archive allowlist admits this private entry only in PERSONAL bundles. Existing-data/downgrade behavior retains preferences for later restoration without exposing daily data.
- Rendered results are tied to instance/account/Space/period and the fresh authorized evidence revision. Pending requests are cancelled or ignored after identity changes; changed/refused reads hide prior content. Keep selected results only in the current interaction, with no automatic repeat inference.
- Extend the canonical OpenAPI/generated client and central endpoint-isolation matrix. New feedback persistence requires a reversible Alembic migration and schema-drift coverage.

## Business and quality review

This extends the existing Pro `daily.insights` capability; no new tier or capability. Ordinary daily entries, notes, reveal rules and retained source data remain Core. Cloud/Self-Hosted behavior is identical. Operator inference is optional; deterministic analysis/general recommendations remain available when it is unavailable. Bounded computation, output and admission cover hoster cost. No paid external provider or analytics are added.

Acceptance covers sparse/hidden data equivalence, group thresholds, supplied-ID validation, fallback, feedback isolation/export/deletion, entitlement and membership loss, evidence changes during inference, rate/concurrency bounds, generation/feedback failure and offline behavior, source/period changes and Compact/Expanded Light/Dark/large-text accessibility. The existing Wir archive-action correction and all other PR features remain intact.

## Implementation evidence

Actual synthetic-fixture browser evidence: [360 Light](evidence/weekly-ai-360-light.webp), [390 Dark](evidence/weekly-ai-390-dark.webp), [430 Light](evidence/weekly-ai-430-light.webp), [Expanded Dark](evidence/weekly-ai-1280-dark.webp), [320 Dark at 200% text](evidence/weekly-ai-320-dark-200pct.webp), [sparse data and failed feedback](evidence/weekly-ai-sparse-error-390.webp). The source period and sample counts remain visible. Eleven browser cases cover existing navigation/charts/recap coexistence, explicit generation, confirmed private feedback, general fallback, stale revisions and revoked access. The fake clock is installed before query timers to exercise real refetch scheduling. Browser fixtures assert the AI provenance contract; production model quality is not claimed from a mocked response.

The backend uses shared per-Space admission (two model requests per minute), a process-wide two-slot transport semaphore, at most eight seconds per HTTP phase plus elapsed-budget checks, 24 KB input / 16 KB transport response limits and a 180-token weekly selection limit. Fallback is always available; there is no new model download or provider deployment. The six-entry editorial catalog is versioned with localized copy; it offers general activities, not clinical guidance. The downgrade gate exposes caller-only clearing without a Pro read.
