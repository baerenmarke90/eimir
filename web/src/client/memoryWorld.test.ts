// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearMemoryWorldPreferences,
  DEFAULT_MEMORY_WORLD,
  forgetMemoryWorld,
  isMemoryWorld,
  isProMemoryWorld,
  MEMORY_WORLD_CAPABILITY,
  MEMORY_WORLDS,
  memoryWorldStorageKey,
  readMemoryWorld,
  rememberMemoryWorld,
} from './memoryWorld';

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('memory worlds', () => {
  it('keeps Story and Stapel free and every other world Pro', () => {
    expect(DEFAULT_MEMORY_WORLD).toBe('story');
    expect(MEMORY_WORLDS).toEqual([
      'story',
      'stack',
      'cloud',
      'mochi',
      'booth',
      'album',
      'stars',
      'post',
      'crate',
      'scratch',
      'jar',
      'fridge',
    ]);
    expect(isProMemoryWorld('story')).toBe(false);
    expect(isProMemoryWorld('stack')).toBe(false);
    expect(isProMemoryWorld('crate')).toBe(true);
    expect(isProMemoryWorld('jar')).toBe(true);
    expect(isProMemoryWorld('post')).toBe(true);
    expect(isProMemoryWorld('stars')).toBe(true);
    expect(isProMemoryWorld('mochi')).toBe(true);
    expect(isProMemoryWorld('scratch')).toBe(true);
    expect(isProMemoryWorld('album')).toBe(true);
    expect(isProMemoryWorld('fridge')).toBe(true);
    expect(isProMemoryWorld('booth')).toBe(true);
    expect(isProMemoryWorld('cloud')).toBe(true);
    expect(MEMORY_WORLD_CAPABILITY).toBe('theme.bespoke_packs');
  });

  it('accepts only known world ids', () => {
    expect(isMemoryWorld('crate')).toBe(true);
    expect(isMemoryWorld('aquarium')).toBe(false);
    expect(isMemoryWorld('jar')).toBe(true);
    expect(isMemoryWorld(null)).toBe(false);
  });
});

describe('remembered memory world', () => {
  const key = memoryWorldStorageKey('https://app.example/', 'a1', 's1');

  it('scopes the key by instance, account and space', () => {
    expect(key).toBe(memoryWorldStorageKey('https://app.example', 'a1', 's1'));
    expect(key).not.toBe(
      memoryWorldStorageKey('https://app.example', 'a2', 's1'),
    );
  });

  it('remembers, reads and forgets a world', () => {
    expect(readMemoryWorld(key)).toBeUndefined();
    rememberMemoryWorld(key, 'crate');
    expect(readMemoryWorld(key)).toBe('crate');
    forgetMemoryWorld(key);
    expect(readMemoryWorld(key)).toBeUndefined();
  });

  it('ignores unknown, outdated and future values', () => {
    localStorage.setItem(
      key,
      JSON.stringify({ schema: 1, world: 'aquarium', savedAt: Date.now() }),
    );
    expect(readMemoryWorld(key)).toBeUndefined();
    localStorage.setItem(
      key,
      JSON.stringify({
        schema: 1,
        world: 'stack',
        savedAt: Date.now() + 60_000,
      }),
    );
    expect(readMemoryWorld(key)).toBeUndefined();
    localStorage.setItem(
      key,
      JSON.stringify({
        schema: 1,
        world: 'stack',
        savedAt: Date.now() - 31 * 24 * 60 * 60_000,
      }),
    );
    expect(readMemoryWorld(key)).toBeUndefined();
    localStorage.setItem(key, '{broken');
    expect(readMemoryWorld(key)).toBeUndefined();
  });

  it('clears every remembered world on sign-out but nothing else', () => {
    rememberMemoryWorld(key, 'stack');
    localStorage.setItem('unrelated', 'kept');
    clearMemoryWorldPreferences();
    expect(readMemoryWorld(key)).toBeUndefined();
    expect(localStorage.getItem('unrelated')).toBe('kept');
  });
});
