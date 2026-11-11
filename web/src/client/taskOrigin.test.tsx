// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import {
  BrowserRouter,
  MemoryRouter,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TaskOriginProvider,
  taskOriginPath,
  useTaskOrigin,
} from './taskOrigin';

let origin: ReturnType<typeof useTaskOrigin>;
let currentPath = '';
let currentState: unknown;
let navigate: ReturnType<typeof useNavigate>;
function Probe() {
  origin = useTaskOrigin();
  const location = useLocation();
  navigate = useNavigate();
  currentPath = `${location.pathname}${location.search}`;
  currentState = location.state;
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
  it('retains map source/camera context only inside the scoped in-memory origin', async () => {
    const view = render(<Harness />);
    await act(async () => navigate('/story/map?place=49%3A7'));
    const context = {
      placeId: '49:7',
      memoryId: 'map-source',
      viewport: { latitude: 49.1, longitude: 7.2, zoom: 16 },
      fullscreen: true,
    };
    const key = origin.captureOrigin({ memoryMap: context });
    expect(origin.resolveOrigin(key)).toMatchObject({
      to: '/story/map?place=49%3A7',
      memoryMap: context,
    });
    expect(JSON.stringify(window.history.state)).not.toMatch(
      /map-source|latitude|longitude|fullscreen/,
    );
    view.rerender(<Harness account="account-b" />);
    expect(origin.resolveOrigin(key)).toBeNull();
  });
  it('restores the upstream context after a nested task replaces itself with its result', async () => {
    window.history.replaceState(
      { idx: 0, key: 'planning', usr: null },
      '',
      '/plan',
    );
    render(
      <BrowserRouter>
        <TaskOriginProvider accountId="account-a" spaceId="space-a">
          <Probe />
        </TaskOriginProvider>
      </BrowserRouter>,
    );
    const planningKey = origin.captureOrigin({ planningSegment: 'wishes' });
    await act(async () =>
      navigate('/plan/choose', { state: { taskOriginKey: planningKey } }),
    );
    const selectionKey = origin.captureOrigin();
    await act(async () =>
      navigate('/plan/plans/result', {
        replace: true,
        state: { taskOriginKey: selectionKey },
      }),
    );
    await act(async () => origin.requestReturn(selectionKey));
    expect(currentPath).toBe('/plan/choose');
    expect(currentState).toEqual({
      taskReturnKey: selectionKey,
      taskOriginKey: planningKey,
    });
    expect(origin.resolveOrigin(planningKey)).toMatchObject({
      planningSegment: 'wishes',
    });
    await act(async () => origin.requestReturn(planningKey));
    await waitFor(() => expect(currentPath).toBe('/plan'));
  });

  it('does not restore an untrusted upstream origin from route state', async () => {
    render(<Harness />);
    window.history.replaceState(
      { usr: { taskOriginKey: 'foreign-origin' } },
      '',
      '/story',
    );
    const key = origin.captureOrigin();
    await act(async () => navigate('/plan/plans/result'));
    await act(async () => origin.requestReturn(key));
    expect(currentState).toEqual({ taskReturnKey: key });
    expect(origin.resolveOrigin(key)).not.toHaveProperty('taskOriginKey');
  });

  it('primary selection opens canonical defaults while detail origins retain their full context', async () => {
    render(<Harness />);
    const key = origin.captureOrigin({ loadedPageCount: 4 });
    expect(origin.primaryDestination('/story')).toEqual({ to: '/story' });
    expect(origin.resolveOrigin(key)).toMatchObject({
      to: '/story?type=MEMORY&year=2025&order=ASC&tab=timeline',
      loadedPageCount: 4,
    });
    await act(async () => navigate('/plan'));
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(400);
    const planKey = origin.captureOrigin({ planningSegment: 'wishes' });
    expect(origin.primaryDestination('/plan')).toEqual({ to: '/plan' });
    expect(origin.resolveOrigin(planKey)).toMatchObject({
      planningSegment: 'wishes',
      scrollY: 400,
    });
    expect(origin.primaryDestination('//other.example')).toEqual({
      to: '/today',
    });
    expect(JSON.stringify(window.history.state)).not.toMatch(
      /private-words|2025/,
    );
  });

  it('invalidates retained task callbacks on account or Space replacement', () => {
    const view = render(<Harness />);
    const key = origin.captureOrigin();
    const oldResolve = origin.resolveOrigin;
    view.rerender(<Harness account="account-b" />);
    expect(origin.resolveOrigin(key)).toBeNull();
    expect(oldResolve(key)).toBeNull();
    const nextKey = origin.captureOrigin();
    view.rerender(<Harness account="account-b" space="space-b" />);
    expect(origin.resolveOrigin(nextKey)).toBeNull();
    expect(origin.primaryDestination('/story')).toEqual({ to: '/story' });
  });

  it('keeps Places lifecycle scope on return and excludes authored or unknown query values', () => {
    expect(taskOriginPath('/more/places', '?scope=ARCHIVED&name=private')).toBe(
      '/more/places?scope=ARCHIVED',
    );
    expect(taskOriginPath('/more/places', '?scope=ALL')).toBe(
      '/more/places?scope=ALL',
    );
    expect(taskOriginPath('/more/places', '?scope=invalid&name=private')).toBe(
      '/more/places',
    );
  });

  it('allowlists local primary routes and serializes only non-sensitive Timeline scope', () => {
    expect(taskOriginPath('//other.example', '')).toBeNull();
    expect(taskOriginPath('/story/memories/memory-1', '?body=private')).toBe(
      '/story/memories/memory-1',
    );
    expect(taskOriginPath('/more/private', '?title=private')).toBe(
      '/more/private',
    );
    expect(taskOriginPath('/more/private/', '')).toBe('/more/private');
    expect(taskOriginPath('/more/private/notes', '')).toBeNull();
    expect(taskOriginPath('/more/private/notes/note-1', '')).toBeNull();
    expect(taskOriginPath('/more/private/gift-ideas/gift-1', '')).toBeNull();
    expect(taskOriginPath('/more/private/collections/list-1', '')).toBeNull();
    expect(taskOriginPath('/more/private/partner-notes', '')).toBeNull();
    expect(taskOriginPath('/plan/plans/plan-1', '?title=private')).toBe(
      '/plan/plans/plan-1',
    );
    expect(taskOriginPath('/plan/wishes/wish-1', '')).toBe(
      '/plan/wishes/wish-1',
    );
    expect(taskOriginPath('/plan/places/place-1', '?title=private')).toBe(
      '/plan/places/place-1',
    );
    expect(taskOriginPath('/plan/chapters/chapter-1', '')).toBe(
      '/plan/chapters/chapter-1',
    );
    expect(taskOriginPath('/plan/chapters/new', '')).toBeNull();
    expect(taskOriginPath('/today/activity', '?body=private')).toBe(
      '/today/activity',
    );
    expect(taskOriginPath('/today/activity', '?scope=own&body=private')).toBe(
      '/today/activity?scope=own',
    );
    expect(taskOriginPath('/today/activity', '?scope=foreign')).toBe(
      '/today/activity',
    );
    expect(
      taskOriginPath(
        '/story/map',
        '?place=49:7&type=MEMORY&year=2025&body=private',
      ),
    ).toBe('/story/map?type=MEMORY&year=2025&place=49%3A7');
    expect(taskOriginPath('/more/notifications', '?body=private')).toBe(
      '/more/notifications',
    );
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
    // The generated key is random, so a UUID may legitimately contain digit
    // runs such as 1250. Pin its shape, then scan only the remaining state.
    expect(key).toMatch(/^task-[0-9a-f-]{36}$/);
    expect(
      JSON.stringify(window.history.state).replace(key as string, 'task-key'),
    ).not.toMatch(/private-id|private-words|1250|account-a|space-a/);
  });

  it('keeps a generated key that happens to contain a sensitive-looking digit run out of the privacy scan', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '79d960cd-9944-4b5c-8709-463125031fa5',
    );
    render(<Harness />);
    const key = origin.captureOrigin({ selectedKey: 'memory-private-id' });
    expect(key).toBe('task-79d960cd-9944-4b5c-8709-463125031fa5');
    expect(JSON.stringify(window.history.state)).toContain('1250');
    expect(window.history.state).toEqual({
      key: 'router-key',
      usr: { safeFlag: true, taskReturnKey: key },
    });
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

  it('returns to a shared Memory editor without retaining query payloads or resuming it as a root', async () => {
    expect(
      taskOriginPath('/story/memories/memory-1/edit', '?body=private'),
    ).toBe('/story/memories/memory-1/edit');
    expect(taskOriginPath('/story/memories/new/edit', '')).toBeNull();
    expect(taskOriginPath('/story/heart-moments/private/edit', '')).toBeNull();
    render(<Harness />);
    const rootKey = origin.captureOrigin();
    await act(async () => navigate('/story/memories/memory-1/edit'));
    const editKey = origin.captureOrigin();
    await act(async () =>
      navigate('/plan/places/place-1', { state: { taskOriginKey: editKey } }),
    );
    await act(async () => origin.requestReturn(editKey));
    expect(currentPath).toBe('/story/memories/memory-1/edit');
    expect(origin.primaryDestination('/story')).toEqual({ to: '/story' });
    expect(origin.resolveOrigin(rootKey)).not.toBeNull();
  });

  it('preserves recap tab/page but strips private query input', () => {
    expect(taskOriginPath('/more/passport', '?tab=years&text=private')).toBe(
      '/more/passport?tab=years',
    );
    expect(
      taskOriginPath(
        '/more/passport/edition',
        '?page=2&tab=years&draft=private',
      ),
    ).toBe('/more/passport/edition?tab=years&page=2');
    expect(
      taskOriginPath('/more/passport/edition', '?page=999&tab=unknown'),
    ).toBe('/more/passport/edition');
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

it('returns to the selected saved-memory map place without retaining arbitrary query text', () => {
  expect(taskOriginPath('/story/map', '?place=52.51:13.35&body=private')).toBe(
    '/story/map?place=52.51%3A13.35',
  );
  expect(taskOriginPath('/story/map', '?place=999:13')).toBe('/story/map');
  expect(taskOriginPath('/story/map', '?place=https://other.example')).toBe(
    '/story/map',
  );
  expect(taskOriginPath('/more/collections', '?title=private')).toBe(
    '/more/collections',
  );
});
