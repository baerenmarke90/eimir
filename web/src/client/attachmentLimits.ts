/**
 * Mirrors `MAX_MEMORY_ATTACHMENTS` in
 * `backend/src/eimir/attachments/binding.py` (M2-D04 cardinality limit).
 *
 * No shared/generated contract exposes this value today (it is a service-side
 * validation constant, not part of any OpenAPI schema), so it is duplicated
 * here as one explicitly versioned constant. `attachmentLimits.test.ts`
 * enforces this value stays in sync with the backend source of truth so it
 * cannot silently drift.
 */
export const MAX_MEMORY_ATTACHMENTS = 20;
