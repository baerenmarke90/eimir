import type { MemoryCreate } from '../api/generated/models/MemoryCreate';
import {
  CREATE_RECONCILIATION_WINDOW_MS,
  newIdempotencyKey,
} from './createRequestIdentity';

/**
 * A Memory create is reconciled through a request identity (ADR 0012): the
 * same `Idempotency-Key` sent with the identical request returns the original
 * Memory instead of creating another one. The server keeps the identity for
 * 24 hours; the client stops replaying after half of that so clock skew can
 * never turn an expired identity into a duplicate.
 */
export const RECONCILIATION_WINDOW_MS = CREATE_RECONCILIATION_WINDOW_MS;

export { newIdempotencyKey };

/** The problem code for an identity whose Memory was deleted afterwards. */
export const MEMORY_CREATE_RESULT_DELETED = 'MEMORY_CREATE_RESULT_DELETED';

export interface MemoryCreateAttempt {
  readonly idempotencyKey: string;
  /** The exact submitted snapshot; a replay must never differ from it. */
  readonly snapshot: MemoryCreate;
  readonly attachmentIds: readonly string[];
  readonly startedAt: number;
}

export function startMemoryCreateAttempt(
  snapshot: MemoryCreate,
  attachmentIds: readonly string[],
  now: number = Date.now(),
): MemoryCreateAttempt {
  return {
    idempotencyKey: newIdempotencyKey(),
    snapshot,
    attachmentIds,
    startedAt: now,
  };
}

export function canStillReconcile(
  attempt: MemoryCreateAttempt,
  now: number = Date.now(),
): boolean {
  return now - attempt.startedAt <= RECONCILIATION_WINDOW_MS;
}
