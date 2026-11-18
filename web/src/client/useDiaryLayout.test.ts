// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DIARY_LAYOUT, useDiaryLayout } from './useDiaryLayout';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useDiaryLayout', () => {
  it('defaults to the Album when nothing is stored', () => {
    expect(DEFAULT_DIARY_LAYOUT).toBe('album');
    const { result } = renderHook(() => useDiaryLayout());
    expect(result.current[0]).toBe('album');
  });

  it('keeps a stored choice and persists a new one', () => {
    window.localStorage.setItem('eimir.diaryLayout', 'compact');
    const { result } = renderHook(() => useDiaryLayout());
    expect(result.current[0]).toBe('compact');
    act(() => result.current[1]('album'));
    expect(result.current[0]).toBe('album');
    expect(window.localStorage.getItem('eimir.diaryLayout')).toBe('album');
  });

  it('updates a mounted consumer when another one changes the choice', () => {
    const wir = renderHook(() => useDiaryLayout());
    const settings = renderHook(() => useDiaryLayout());
    act(() => settings.result.current[1]('compact'));
    expect(wir.result.current[0]).toBe('compact');
    act(() => settings.result.current[1]('album'));
    expect(wir.result.current[0]).toBe('album');
  });

  it('ignores unknown stored values', () => {
    window.localStorage.setItem('eimir.diaryLayout', 'garbage');
    expect(renderHook(() => useDiaryLayout()).result.current[0]).toBe('album');
  });

  it('still honours a choice made while storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useDiaryLayout());
    expect(result.current[0]).toBe('album');
    act(() => result.current[1]('compact'));
    expect(result.current[0]).toBe('compact');
  });
});
