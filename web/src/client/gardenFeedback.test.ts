// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySyncedGardenFeedback,
  GARDEN_VOLUME,
  gardenFeedbackKey,
  playTones,
  readGardenFeedback,
  SOUND_TONES,
  saveGardenFeedback,
  useGardenFeedback,
  vibrateNative,
} from './gardenFeedback';

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeAudioContext {
  static created = 0;
  currentTime = 0;
  state = 'running';
  destination = {};
  oscillators: Array<{ type: string; start: unknown; stop: unknown }> = [];
  gains: FakeParam[] = [];
  constructor() {
    FakeAudioContext.created += 1;
  }
  createGain() {
    const gain = new FakeParam();
    this.gains.push(gain);
    return { gain, connect: vi.fn() };
  }
  createOscillator() {
    const oscillator = {
      type: 'sine',
      frequency: new FakeParam(),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
  resume = vi.fn();
  close = vi.fn().mockResolvedValue(undefined);
}

beforeEach(() => {
  window.localStorage.clear();
  FakeAudioContext.created = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('garden feedback preferences', () => {
  it('an open garden picks up a choice synced from another device', () => {
    const { result } = renderHook(() =>
      useGardenFeedback('synced', { native: true }),
    );
    expect(result.current.sound).toBe(false);
    act(() => {
      applySyncedGardenFeedback(gardenFeedbackKey('synced', 'sound'), true);
      applySyncedGardenFeedback(gardenFeedbackKey('synced', 'vibration'), true);
      applySyncedGardenFeedback(gardenFeedbackKey('other', 'sound'), false);
    });
    expect(result.current.sound).toBe(true);
    expect(result.current.vibration).toBe(true);
    expect(readGardenFeedback(gardenFeedbackKey('synced', 'sound'))).toBe(true);
  });

  it('are off by default and remembered per device', () => {
    const key = gardenFeedbackKey('me', 'sound');
    expect(readGardenFeedback(key)).toBe(false);
    saveGardenFeedback(key, true);
    expect(readGardenFeedback(key)).toBe(true);
    expect(readGardenFeedback(gardenFeedbackKey('me', 'vibration'))).toBe(
      false,
    );
  });

  it('stay usable when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const key = gardenFeedbackKey('me', 'sound');
    expect(readGardenFeedback(key)).toBe(false);
    expect(() => saveGardenFeedback(key, true)).not.toThrow();
  });
});

describe('vibration', () => {
  it('only vibrates inside the native app', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    expect(vibrateNative('tap', false)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(vibrateNative('tap', true)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(12);
  });
});

describe('sounds', () => {
  it('synthesizes each sound quietly from short tones', () => {
    const context = new FakeAudioContext();
    playTones(context as unknown as AudioContext, 'quack');
    expect(context.oscillators).toHaveLength(SOUND_TONES.quack.length);
    expect(context.gains[0].value).toBe(GARDEN_VOLUME);
    expect(GARDEN_VOLUME).toBeLessThanOrEqual(0.1);
  });

  it('plays nothing until sounds are turned on, then starts audio on that tap', () => {
    const { result } = renderHook(() =>
      useGardenFeedback('me', { native: false }),
    );
    expect(result.current.sound).toBe(false);
    act(() => result.current.play('plop'));
    expect(FakeAudioContext.created).toBe(0);
    act(() => result.current.setSound(true));
    expect(FakeAudioContext.created).toBe(1);
    act(() => result.current.play('plop'));
    expect(FakeAudioContext.created).toBe(1);
    expect(readGardenFeedback(gardenFeedbackKey('me', 'sound'))).toBe(true);
  });

  it('keeps vibration off outside the native app even when stored on', () => {
    saveGardenFeedback(gardenFeedbackKey('me', 'vibration'), true);
    const web = renderHook(() => useGardenFeedback('me', { native: false }));
    expect(web.result.current.native).toBe(false);
    expect(web.result.current.vibration).toBe(false);
    const native = renderHook(() => useGardenFeedback('me', { native: true }));
    expect(native.result.current.vibration).toBe(true);
  });
});
