import {
  type ClientProblemError,
  normalizeClientError,
} from './problemDetails';

/**
 * Create receipts remain server-addressable for 24 hours. Clients stop
 * replaying after half of that window so clock skew cannot turn an expired
 * request identity into a duplicate create.
 */
export const CREATE_RECONCILIATION_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface CreateRequestAttempt<Snapshot> {
  readonly idempotencyKey: string;
  /** The complete request identity excluding the Idempotency-Key header. */
  readonly snapshot: Snapshot;
  readonly snapshotFingerprint: string;
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

function fingerprint(snapshot: unknown): string {
  const serialized = JSON.stringify(snapshot);
  if (serialized === undefined) {
    throw new Error('Create request snapshot must be serializable');
  }
  return serialized;
}

export function prepareCreateRequestAttempt<Snapshot>(
  previousAttempt: CreateRequestAttempt<Snapshot> | null,
  snapshot: Snapshot,
  now: number = Date.now(),
): CreateRequestAttempt<Snapshot> {
  const snapshotFingerprint = fingerprint(snapshot);
  if (
    previousAttempt &&
    previousAttempt.snapshotFingerprint === snapshotFingerprint &&
    now - previousAttempt.startedAt <= CREATE_RECONCILIATION_WINDOW_MS
  ) {
    return previousAttempt;
  }
  return {
    idempotencyKey: newIdempotencyKey(),
    snapshot,
    snapshotFingerprint,
    startedAt: now,
  };
}

export function isCreateOutcomeUnknown(
  error: Pick<ClientProblemError, 'kind'>,
): boolean {
  return (
    error.kind === 'offline' ||
    error.kind === 'server' ||
    error.kind === 'unknown'
  );
}

/**
 * Runs one user-initiated create. An identical retry keeps its identity only
 * when the previous response may have been lost; authoritative failures and
 * known successes retire the identity immediately.
 */
export async function submitCreateRequest<Snapshot, Result>({
  previousAttempt,
  snapshot,
  rememberAttempt,
  request,
}: {
  previousAttempt: CreateRequestAttempt<Snapshot> | null;
  snapshot: Snapshot;
  rememberAttempt: (attempt: CreateRequestAttempt<Snapshot> | null) => void;
  request: (idempotencyKey: string) => Promise<Result>;
}): Promise<Result> {
  const attempt = prepareCreateRequestAttempt(previousAttempt, snapshot);
  rememberAttempt(attempt);
  try {
    const result = await request(attempt.idempotencyKey);
    rememberAttempt(null);
    return result;
  } catch (error) {
    const problem = await normalizeClientError(error);
    if (!isCreateOutcomeUnknown(problem)) rememberAttempt(null);
    throw problem;
  }
}
