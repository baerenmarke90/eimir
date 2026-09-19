import {
  canStillReconcile,
  newIdempotencyKey,
  RECONCILIATION_WINDOW_MS,
  startMemoryCreateAttempt,
} from './memoryCreateIdentity';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('Memory create request identity', () => {
  it('generates a canonical UUID, also without randomUUID (insecure context)', () => {
    expect(newIdempotencyKey()).toMatch(UUID_V4);
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_, index) => {
          bytes[index] = (index * 37 + 11) % 256;
        });
        return bytes;
      },
    });
    expect(newIdempotencyKey()).toMatch(UUID_V4);
  });

  it('never invents an identity when no secure randomness exists', () => {
    vi.stubGlobal('crypto', {});
    expect(() => newIdempotencyKey()).toThrow();
  });

  it('gives every user-initiated save its own identity and freezes its snapshot', () => {
    const snapshot = { title: 'Lake', body: '' };
    const first = startMemoryCreateAttempt(snapshot, ['a'], 1_000);
    const second = startMemoryCreateAttempt(snapshot, ['a'], 1_000);
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
    expect(first).toMatchObject({ snapshot, attachmentIds: ['a'] });
  });

  it('stops replaying an identity after half of the 24 h server retention', () => {
    const attempt = startMemoryCreateAttempt(
      { title: 'Lake', body: '' },
      [],
      0,
    );
    expect(RECONCILIATION_WINDOW_MS).toBe(12 * 60 * 60 * 1000);
    expect(canStillReconcile(attempt, RECONCILIATION_WINDOW_MS)).toBe(true);
    expect(canStillReconcile(attempt, RECONCILIATION_WINDOW_MS + 1)).toBe(
      false,
    );
  });
});
