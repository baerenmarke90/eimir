import { describe, expect, it } from 'vitest';
import { postSnackbar } from './snackbar';

describe('postSnackbar', () => {
  it('never throws when no window exists to dispatch through', () => {
    // This test suite runs under vitest's `node` environment (no DOM), the
    // same reason productReadCache.ts's own emitCacheEvent guards on
    // `typeof window === 'undefined'` — a mutation's onSuccess must be able
    // to call this unconditionally without knowing whether it is running in
    // a browser.
    expect(() => postSnackbar('snackbar.spaceSwitched')).not.toThrow();
    expect(() =>
      postSnackbar('snackbar.spaceSwitched', { count: 2 }),
    ).not.toThrow();
  });
});
