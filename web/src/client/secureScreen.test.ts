import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  holdSecureScreen,
  resetSecureScreenForTests,
  SecureScreenUnavailable,
} from './secureScreen';

function nativePlugin(
  answer: (secure: boolean) => Promise<{ secure: boolean }>,
) {
  const calls: boolean[] = [];
  return {
    calls,
    plugin: {
      setSecure: vi.fn(({ secure }: { secure: boolean }) => {
        calls.push(secure);
        return answer(secure);
      }),
    },
  };
}

const confirming = () => nativePlugin(async (secure) => ({ secure }));

beforeEach(() => {
  vi.useFakeTimers();
  resetSecureScreenForTests();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('screen protection holds', () => {
  it('does nothing in a browser, where no protection exists', async () => {
    const { plugin } = confirming();
    const hold = holdSecureScreen(false, plugin);
    await expect(hold.ready).resolves.toBeUndefined();
    hold.release();
    await vi.runAllTimersAsync();
    expect(plugin.setSecure).not.toHaveBeenCalled();
  });

  it('is ready only after the window confirms the flag', async () => {
    let answer!: (value: { secure: boolean }) => void;
    const { plugin } = nativePlugin(
      () =>
        new Promise((done) => {
          answer = done;
        }),
    );
    const hold = holdSecureScreen(true, plugin);
    let ready = false;
    void hold.ready.then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toBe(false);
    answer({ secure: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toBe(true);
  });

  it('fails closed when the window does not report the flag or the bridge fails', async () => {
    const unconfirmed = nativePlugin(async () => ({ secure: false }));
    await expect(
      holdSecureScreen(true, unconfirmed.plugin).ready,
    ).rejects.toBeInstanceOf(SecureScreenUnavailable);
    resetSecureScreenForTests();
    const broken = nativePlugin(async () => {
      throw new Error('not implemented');
    });
    await expect(
      holdSecureScreen(true, broken.plugin).ready,
    ).rejects.toBeInstanceOf(SecureScreenUnavailable);
  });

  it('asks again after a failure instead of trusting the earlier request', async () => {
    let fail = true;
    const { plugin, calls } = nativePlugin(async (secure) => {
      if (fail) throw new Error('busy');
      return { secure };
    });
    const first = holdSecureScreen(true, plugin);
    await expect(first.ready).rejects.toBeInstanceOf(SecureScreenUnavailable);
    fail = false;
    const second = holdSecureScreen(true, plugin);
    await expect(second.ready).resolves.toBeUndefined();
    expect(calls).toEqual([true, true]);
  });

  it('keeps the flag while any surface holds it and releases after the last one', async () => {
    const { plugin, calls } = confirming();
    const list = holdSecureScreen(true, plugin);
    const detail = holdSecureScreen(true, plugin);
    await Promise.all([list.ready, detail.ready]);
    list.release();
    list.release();
    await vi.runAllTimersAsync();
    expect(calls).toEqual([true]);
    detail.release();
    await vi.runAllTimersAsync();
    expect(calls).toEqual([true, false]);
  });

  it('does not drop the flag when one private surface replaces another', async () => {
    const { plugin, calls } = confirming();
    const before = holdSecureScreen(true, plugin);
    await before.ready;
    before.release();
    const after = holdSecureScreen(true, plugin);
    await after.ready;
    await vi.runAllTimersAsync();
    expect(calls).toEqual([true]);
    after.release();
    await vi.runAllTimersAsync();
    expect(calls).toEqual([true, false]);
  });

  it('orders a late release before a newer hold, so the newer hold wins', async () => {
    const { plugin, calls } = confirming();
    const first = holdSecureScreen(true, plugin);
    await first.ready;
    first.release();
    await vi.runAllTimersAsync();
    const second = holdSecureScreen(true, plugin);
    await expect(second.ready).resolves.toBeUndefined();
    expect(calls).toEqual([true, false, true]);
  });
});
