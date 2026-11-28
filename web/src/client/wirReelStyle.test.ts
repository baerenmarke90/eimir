// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearWirReelStylePreferences,
  DEFAULT_WIR_REEL_STYLE,
  forgetWirReelStyle,
  isProWirReelStyle,
  isWirReelStyle,
  readWirReelStyle,
  rememberWirReelStyle,
  WIR_REEL_STYLE_CAPABILITY,
  WIR_REEL_STYLES,
  wirReelStyleStorageKey,
} from './wirReelStyle';

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('Wir reel styles (#2345)', () => {
  it('keeps circles free and the default, and tiles and chips Pro', () => {
    expect(DEFAULT_WIR_REEL_STYLE).toBe('circles');
    expect(WIR_REEL_STYLES).toEqual(['circles', 'tiles', 'chips']);
    expect(isProWirReelStyle('circles')).toBe(false);
    expect(isProWirReelStyle('tiles')).toBe(true);
    expect(isProWirReelStyle('chips')).toBe(true);
    expect(WIR_REEL_STYLE_CAPABILITY).toBe('theme.bespoke_packs');
  });

  it('accepts only known style ids', () => {
    expect(isWirReelStyle('tiles')).toBe(true);
    expect(isWirReelStyle('stripes')).toBe(false);
    expect(isWirReelStyle('Tiles')).toBe(false);
    expect(isWirReelStyle(null)).toBe(false);
  });
});

describe('remembered Wir reel style', () => {
  const key = wirReelStyleStorageKey('https://app.example/', 'a1', 's1');

  it('scopes the key by instance, account and space', () => {
    expect(key).toBe(wirReelStyleStorageKey('https://app.example', 'a1', 's1'));
    expect(key).not.toBe(
      wirReelStyleStorageKey('https://app.example', 'a2', 's1'),
    );
  });

  it('remembers, reads and forgets a style', () => {
    expect(readWirReelStyle(key)).toBeUndefined();
    rememberWirReelStyle(key, 'chips');
    expect(readWirReelStyle(key)).toBe('chips');
    forgetWirReelStyle(key);
    expect(readWirReelStyle(key)).toBeUndefined();
  });

  it('ignores unknown values and forgets a style after 30 days', () => {
    localStorage.setItem(
      key,
      JSON.stringify({ schema: 1, style: 'stripes', savedAt: Date.now() }),
    );
    expect(readWirReelStyle(key)).toBeUndefined();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    rememberWirReelStyle(key, 'tiles');
    vi.setSystemTime(new Date('2026-12-01T00:00:01Z'));
    expect(readWirReelStyle(key)).toBeUndefined();
  });

  it('clears every remembered style on sign-out', () => {
    rememberWirReelStyle(key, 'tiles');
    clearWirReelStylePreferences();
    expect(readWirReelStyle(key)).toBeUndefined();
  });
});
