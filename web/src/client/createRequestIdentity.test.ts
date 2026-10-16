import { ClientProblemError } from './problemDetails';
import {
  CREATE_RECONCILIATION_WINDOW_MS,
  type CreateRequestAttempt,
  prepareCreateRequestAttempt,
  submitCreateRequest,
} from './createRequestIdentity';

describe('shared create request identity', () => {
  it('reuses an unexpired identity only for the identical request snapshot', () => {
    const first = prepareCreateRequestAttempt(null, { title: 'Lake' }, 1_000);
    const replay = prepareCreateRequestAttempt(first, { title: 'Lake' }, 2_000);
    const changed = prepareCreateRequestAttempt(
      first,
      { title: 'Forest' },
      2_000,
    );
    const expired = prepareCreateRequestAttempt(
      first,
      { title: 'Lake' },
      1_000 + CREATE_RECONCILIATION_WINDOW_MS + 1,
    );

    expect(replay).toBe(first);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(expired.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('retains an identity across an unknown outcome and clears it after success', async () => {
    type Snapshot = { title: string };
    let remembered: CreateRequestAttempt<Snapshot> | null = null;
    const seenKeys: string[] = [];
    const snapshot = { title: 'Lake' };

    await expect(
      submitCreateRequest({
        previousAttempt: remembered,
        snapshot,
        rememberAttempt: (attempt) => {
          remembered = attempt;
        },
        request: async (idempotencyKey) => {
          seenKeys.push(idempotencyKey);
          throw new Error('response lost');
        },
      }),
    ).rejects.toMatchObject({ kind: 'unknown' });

    expect(remembered).not.toBeNull();
    await expect(
      submitCreateRequest({
        previousAttempt: remembered,
        snapshot: { title: 'Lake' },
        rememberAttempt: (attempt) => {
          remembered = attempt;
        },
        request: async (idempotencyKey) => {
          seenKeys.push(idempotencyKey);
          return { id: 'created' };
        },
      }),
    ).resolves.toEqual({ id: 'created' });

    expect(seenKeys[1]).toBe(seenKeys[0]);
    expect(remembered).toBeNull();
  });

  it('retires an identity after an authoritative failure', async () => {
    type Snapshot = { title: string };
    let remembered: CreateRequestAttempt<Snapshot> | null = null;

    await expect(
      submitCreateRequest({
        previousAttempt: remembered,
        snapshot: { title: 'Lake' },
        rememberAttempt: (attempt) => {
          remembered = attempt;
        },
        request: async () => {
          throw new ClientProblemError('validation', 422);
        },
      }),
    ).rejects.toMatchObject({ kind: 'validation', status: 422 });

    expect(remembered).toBeNull();
  });
});
