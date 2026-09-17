// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TaskOriginProvider,
  taskOriginPath,
  useTaskOrigin,
} from './taskOrigin';

let origin: ReturnType<typeof useTaskOrigin>;
let currentPath = '';
let navigate: ReturnType<typeof useNavigate>;
function Probe() {
  origin = useTaskOrigin();
  const location = useLocation();
  navigate = useNavigate();
  currentPath = `${location.pathname}${location.search}`;
  return null;
}
function Harness({
  account = 'account-a',
  space = 'space-a',
}: {
  account?: string;
  space?: string;
}) {
  return (
    <MemoryRouter
      initialEntries={[
        '/story?tab=timeline&type=MEMORY&year=2025&order=ASC&q=private-words',
      ]}
    >
      <TaskOriginProvider accountId={account} spaceId={space}>
        <Probe />
      </TaskOriginProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.history.replaceState(
    { key: 'router-key', usr: { safeFlag: true } },
    '',
    '/story',
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('task origin privacy and lifetime', () => {
  it('allowlists local primary routes and serializes only non-sensitive Timeline scope', () => {
    expect(taskOriginPath('//other.example', '')).toBeNull();
    expect(taskOriginPath('/story/memories/secret', '')).toBeNull();
    expect(taskOriginPath('/more/private', '')).toBeNull();
    expect(taskOriginPath('/plan/plans/plan-1', '?title=private')).toBe(
      '/plan/plans/plan-1',
    );
    expect(taskOriginPath('/plan/wishes/wish-1', '')).toBe(
      '/plan/wishes/wish-1',
    );
    expect(taskOriginPath('/plan/places/place-1', '')).toBeNull();
    expect(
      taskOriginPath(
        '/story',
        '?tab=timeline&type=MEMORY&year=2025&order=ASC&q=private&title=hidden',
      ),
    ).toBe('/story?type=MEMORY&year=2025&order=ASC&tab=timeline');
    expect(taskOriginPath('/today', '?body=private')).toBe('/today');
    expect(taskOriginPath('/story', '?type=INVALID&year=-1&tab=invalid')).toBe(
      '/story',
    );
  });

  it('keeps selection, range and position in memory with only an opaque existing-entry marker', () => {
    render(<Harness />);
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 1250,
    });
    const beforeLength = window.history.length;
    const key = origin.captureOrigin({
      selectedKey: 'memory-private-id',
      selectedOffset: 94,
      loadedPageCount: 3,
    });
    expect(key).toMatch(/^task-/);
    expect(origin.resolveOrigin(key)).toMatchObject({
      scrollY: 1250,
      loadedPageCount: 3,
      selectedKey: 'memory-private-id',
    });
    expect(window.history.length).toBe(beforeLength);
    expect(window.history.state).toEqual({
      key: 'router-key',
      usr: { safeFlag: true, taskReturnKey: key },
    });
    expect(JSON.stringify(window.history.state)).not.toMatch(
      /private-id|private-words|1250|account-a|space-a/,
    );
  });

  it('retains the full loaded range as bounded metadata without another data cache', () => {
    render(<Harness />);
    const key = origin.captureOrigin({ loadedPageCount: 85 });
    expect(origin.resolveOrigin(key)?.loadedPageCount).toBe(85);
    expect(window.history.state.usr).toEqual({
      safeFlag: true,
      taskReturnKey: key,
    });
    const invalid = origin.captureOrigin({
      loadedPageCount: Number.POSITIVE_INFINITY,
    });
    expect(origin.resolveOrigin(invalid)?.loadedPageCount).toBe(1);
  });

  it('clears foreign context and late callbacks, including a switch away and back', () => {
    const view = render(<Harness />);
    const previous = origin;
    const key = origin.captureOrigin();
    view.rerender(<Harness space="space-b" />);
    expect(origin.resolveOrigin(key)).toBeNull();
    expect(previous.captureOrigin()).toBeNull();
    view.rerender(<Harness />);
    expect(previous.captureOrigin()).toBeNull();
    expect(previous.resolveOrigin(key)).toBeNull();
    view.rerender(<Harness account="account-b" />);
    expect(origin.resolveOrigin(key)).toBeNull();
    const last = origin;
    const lastKey = origin.captureOrigin();
    view.unmount();
    expect(last.resolveOrigin(lastKey)).toBeNull();
  });

  it('expires old origins and evicts the oldest bounded entry', () => {
    render(<Harness />);
    const first = origin.captureOrigin();
    for (let i = 0; i < 12; i += 1) origin.captureOrigin();
    expect(origin.resolveOrigin(first)).toBeNull();
    const recent = origin.captureOrigin();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60 * 1000);
    expect(origin.resolveOrigin(recent)).toBeNull();
  });

  it('allowlists /search as a return origin without ever putting its query text in the path', () => {
    expect(taskOriginPath('/search', '?q=secret+words&kind=MEMORY')).toBe(
      '/search',
    );
  });

  it('restores a Search origin query/kind from in-memory metadata, never from the URL/history', () => {
    render(<Harness />);
    const key = origin.captureOrigin({
      searchQuery: 'our first trip',
      searchKind: 'MEMORY',
    });
    expect(origin.resolveOrigin(key)).toMatchObject({
      searchQuery: 'our first trip',
      searchKind: 'MEMORY',
    });
    expect(JSON.stringify(window.history.state)).not.toMatch(/our first trip/);
  });

  it('restores validated scope or safely replaces direct and invalid entries', async () => {
    render(<Harness />);
    const key = origin.captureOrigin();
    await act(async () =>
      navigate('/story/memories/result', { state: { taskOriginKey: key } }),
    );
    await act(async () => origin.requestReturn(key));
    expect(currentPath).toBe(
      '/story?type=MEMORY&year=2025&order=ASC&tab=timeline',
    );
    await act(async () => navigate('/story/memories/direct'));
    await act(async () =>
      origin.requestReturn('https://other.example/private'),
    );
    expect(currentPath).toBe('/story');
  });
});
