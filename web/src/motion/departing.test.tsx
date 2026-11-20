// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDepartingItems } from './departing';

const keyOf = (item: string) => item;
const shown = (entries: { key: string; departing: boolean }[]) =>
  entries.map(({ key, departing }) => (departing ? `${key}…` : key));

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.style.setProperty('--duration-context', '280ms');
});
afterEach(() => {
  vi.useRealTimers();
  document.documentElement.style.removeProperty('--duration-context');
});

function view(initial: string[], resetKey = 'shared') {
  const onRemoved = vi.fn();
  const hook = renderHook(
    ({ items, reset }) => useDepartingItems(items, keyOf, reset, onRemoved),
    { initialProps: { items: initial, reset: resetKey } },
  );
  return { hook, onRemoved };
}

it('keeps a deleted item in place while it leaves, then forgets its bytes', () => {
  const { hook, onRemoved } = view(['a', 'b', 'c', 'd']);
  hook.rerender({ items: ['a', 'c', 'd'], reset: 'shared' });
  expect(shown(hook.result.current.entries)).toEqual(['a', 'b…', 'c', 'd']);
  expect(onRemoved).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(280));
  expect(shown(hook.result.current.entries)).toEqual(['a', 'c', 'd']);
  expect(onRemoved).toHaveBeenCalledExactlyOnceWith(['b']);
});

it('replaces the list at once for another filter, Space or account', () => {
  const { hook, onRemoved } = view(['a', 'b']);
  hook.rerender({ items: ['x'], reset: 'private' });
  expect(shown(hook.result.current.entries)).toEqual(['x']);
  act(() => vi.advanceTimersByTime(1000));
  expect(onRemoved).not.toHaveBeenCalled();
});

it('removes at once under reduced motion but still forgets the bytes', () => {
  document.documentElement.style.setProperty('--duration-context', '0ms');
  const { hook, onRemoved } = view(['a', 'b', 'c']);
  hook.rerender({ items: ['a', 'c'], reset: 'shared' });
  expect(shown(hook.result.current.entries)).toEqual(['a', 'c']);
  expect(onRemoved).toHaveBeenCalledExactlyOnceWith(['b']);
});

it('does not animate a bulk change item by item', () => {
  const many = Array.from({ length: 20 }, (_, index) => `item-${index}`);
  const { hook, onRemoved } = view(many);
  hook.rerender({ items: many.slice(0, 2), reset: 'shared' });
  expect(hook.result.current.entries).toHaveLength(2);
  expect(onRemoved).toHaveBeenCalledOnce();
});
