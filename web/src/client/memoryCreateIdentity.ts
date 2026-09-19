import type { MemoryCreate } from '../api/generated/models/MemoryCreate';

/**
 * A Memory create is reconciled through a request identity (ADR 0012): the
 * same `Idempotency-Key` sent with the identical request returns the original
 * Memory instead of creating another one. The server keeps the identity for
 * 24 hours; the client stops replaying after half of that so clock skew can
 * never turn an expired identity into a duplicate.
 */
export const RECONCILIATION_WINDOW_MS = 12 * 60 * 60 * 1000;

/** The problem code for an identity whose Memory was deleted afterwards. */
export const MEMORY_CREATE_RESULT_DELETED = 'MEMORY_CREATE_RESULT_DELETED';

export interface MemoryCreateAttempt {
  readonly idempotencyKey: string;
  /** The exact submitted snapshot; a replay must never differ from it. */
  readonly snapshot: MemoryCreate;
  readonly attachmentIds: readonly string[];
  readonly startedAt: number;
}

export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function')
    return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('Secure request identity generation is unavailable');
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
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
