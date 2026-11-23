// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setPrimaryTabPeek } from '../client/primaryTabPeek';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import { usePrimaryNavigation } from '../client/usePrimaryNavigation';
import { PrimaryTabPanels } from './PrimaryTabPanels';

let navigate: ReturnType<typeof useNavigate>;
let openTab: ReturnType<typeof usePrimaryNavigation>['navigatePrimary'];
const mounts: string[] = [];
const captures = new Map<string, () => string | null>();

function Page({ name }: { name: string }) {
  const location = useLocation();
  const { captureOrigin } = useTaskOrigin();
  captures.set(name, () => captureOrigin());
  useEffect(() => {
    mounts.push(name);
  }, [name]);
  return (
    <section className="page">
      <h1>{name}</h1>
      <output data-testid={`${name}-search`}>{location.search}</output>
    </section>
  );
}

function Navigator() {
  navigate = useNavigate();
  openTab = usePrimaryNavigation().navigatePrimary;
  return null;
}

function Harness({ prewarm }: { prewarm?: readonly string[] }) {
  return (
    <MemoryRouter initialEntries={['/today']}>
      <TaskOriginProvider accountId="account" spaceId="space">
        <Navigator />
        <PrimaryTabPanels
          fallback={<p>failed</p>}
          prewarm={prewarm}
          panels={[
            { path: '/today', element: <Page name="today" /> },
            { path: '/story', element: <Page name="story" /> },
            { path: '/plan', element: <Page name="plan" /> },
          ]}
        />
        <Routes>
          <Route path="/story/memories/:id" element={<p>detail</p>} />
          <Route path="*" element={null} />
        </Routes>
      </TaskOriginProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mounts.length = 0;
  captures.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  setPrimaryTabPeek(null);
  vi.restoreAllMocks();
});

const panel = (path: string) =>
  document.querySelector<HTMLElement>(`[data-primary-tab="${path}"]`);

it('mounts a tab on its first visit and keeps it mounted while hidden', async () => {
  render(<Harness />);
  expect(panel('/today')?.hidden).toBe(false);
  expect(panel('/story')).toBeNull();

  await act(() => navigate('/story'));
  expect(panel('/today')?.hidden).toBe(true);
  expect(panel('/story')?.hidden).toBe(false);
  expect(screen.getByRole('heading')).toHaveProperty('textContent', 'story');

  await act(() => navigate('/today'));
  await act(() => navigate('/story/memories/m1'));
  await act(() => navigate('/story'));
  // Returning, including from a detail route, reuses the kept views.
  expect(mounts).toEqual(['today', 'story']);
});

it('freezes the location a hidden tab sees', async () => {
  render(<Harness />);
  await act(() => navigate('/today?view=week'));
  await act(() => navigate('/plan?view=wishes'));
  expect(screen.getByTestId('today-search').textContent).toBe('?view=week');
  expect(screen.getByTestId('plan-search').textContent).toBe('?view=wishes');
});

it('starts Wir at the top when the tab is explicitly reopened', async () => {
  render(<Harness />);
  const scrollTo = vi.mocked(window.scrollTo);
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
  window.dispatchEvent(new Event('scroll'));
  await act(() => navigate('/story'));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  await act(() => navigate('/today'));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
});

/** A carousel inside the panel that remembers how far it was swiped. */
function addCarousel(path: string, scrollLeft: number) {
  const carousel = document.createElement('div');
  let offset = scrollLeft;
  Object.defineProperty(carousel, 'scrollLeft', {
    configurable: true,
    get: () => offset,
    set: (value: number) => {
      offset = value;
    },
  });
  panel(path)?.appendChild(carousel);
  return carousel;
}

it('puts the Wir carousels back to their first item when the tab is reopened', async () => {
  render(<Harness />);
  const lists = addCarousel('/today', 320);
  const upcoming = addCarousel('/today', 180);
  await act(() => navigate('/story'));
  // Leaving keeps the offsets while the panel is hidden ...
  expect(lists.scrollLeft).toBe(320);
  await act(() => navigate('/today'));
  // ... and reopening from the tab bar starts them over.
  expect(lists.scrollLeft).toBe(0);
  expect(upcoming.scrollLeft).toBe(0);
});

it('keeps the Wir carousels where they were on Back', async () => {
  render(<Harness />);
  const lists = addCarousel('/today', 320);
  await act(() => navigate('/story'));
  await act(() => navigate(-1));
  expect(lists.scrollLeft).toBe(320);
});

it('shows Wir from its first carousel item while it is peeked', async () => {
  render(<Harness />);
  await act(() => navigate('/story'));
  const lists = addCarousel('/today', 240);
  await act(() => setPrimaryTabPeek('/today'));
  expect(lists.scrollLeft).toBe(0);
});

it('restores the Wir reading position on Back after a fast navigation', async () => {
  render(<Harness />);
  const scrollTo = vi.mocked(window.scrollTo);
  // A fast root navigation may commit before the browser dispatches a scroll
  // event for the most recent reading position.
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 540 });
  await act(() => navigate('/story'));
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  await act(() => navigate(-1));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 540, behavior: 'instant' });
});

it('restores Wir on an explicit task return', async () => {
  render(<Harness />);
  const scroll = vi.mocked(window.scrollTo);
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 });
  const key = captures.get('today')?.();
  expect(key).toBeTruthy();
  await act(() => navigate('/story/memories/m1'));
  await act(() =>
    navigate('/today', { replace: true, state: { taskReturnKey: key } }),
  );
  expect(scroll).toHaveBeenLastCalledWith({ top: 420, behavior: 'instant' });
});

it('lets only the visible tab capture a task origin', async () => {
  render(<Harness />);
  await act(() => navigate('/story'));
  await act(() => navigate('/plan'));
  expect(captures.get('story')?.()).toBeNull();
  expect(captures.get('plan')?.()).toMatch(/^task-/);
});

function clampedScrolling(initialMax: number) {
  let scrollY = 0;
  const page = { max: initialMax };
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get: () => scrollY,
  });
  vi.mocked(window.scrollTo).mockImplementation(((options: ScrollToOptions) => {
    scrollY = Math.min(options.top ?? 0, page.max);
  }) as typeof window.scrollTo);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  const flush = () => {
    const pending = frames.splice(0);
    for (const callback of pending) callback(0);
  };
  return {
    page,
    flush,
    setScroll(value: number) {
      scrollY = value;
    },
  };
}

it('previews and reopens a previously scrolled primary tab at the top', async () => {
  const scroll = clampedScrolling(2000);
  render(<Harness />);
  await act(() => openTab('/story'));
  scroll.setScroll(540);
  await act(() => openTab('/plan'));

  await act(() => setPrimaryTabPeek('/story'));
  expect(
    panel('/story')?.style.getPropertyValue('--primary-tab-peek-origin'),
  ).toBe('0px');
  await act(() => openTab('/story'));
  await act(() => setPrimaryTabPeek(null));
  expect(window.scrollY).toBe(0);
});

it('restores tab entries reached through Back and Forward', async () => {
  const scroll = clampedScrolling(2000);
  render(<Harness />);
  await act(() => openTab('/story'));
  scroll.setScroll(540);
  await act(() => openTab('/plan'));
  scroll.setScroll(220);

  await act(() => navigate(-1));
  expect(window.scrollY).toBe(540);
  await act(() => navigate(1));
  expect(window.scrollY).toBe(220);
});

it('restores the reading position on Back to a Planning segment', async () => {
  const scroll = clampedScrolling(2000);
  render(<Harness />);
  await act(() => navigate('/plan#wishes'));
  scroll.setScroll(420);
  await act(() => navigate('/plan/wishes/w1'));
  scroll.setScroll(0);

  await act(() => navigate(-1));
  expect(window.scrollY).toBe(420);
});

it('keeps restoring while a revealed tab is still settling to its full height', async () => {
  const scroll = clampedScrolling(2000);
  render(<Harness />);
  scroll.setScroll(370);
  await act(() => navigate('/story'));
  // The revealed tab is briefly 46px shorter than when it was left.
  scroll.page.max = 324;
  await act(() => navigate(-1));
  expect(window.scrollY).toBe(324);
  scroll.page.max = 2000;
  act(() => scroll.flush());
  expect(window.scrollY).toBe(370);
});

it('stops restoring as soon as something else scrolls the page', async () => {
  const scroll = clampedScrolling(2000);
  render(<Harness />);
  scroll.setScroll(370);
  await act(() => navigate('/story'));
  scroll.page.max = 324;
  await act(() => navigate(-1));
  // Reselecting the tab (or the person) scrolls to the top meanwhile.
  scroll.setScroll(0);
  scroll.page.max = 2000;
  act(() => scroll.flush());
  expect(window.scrollY).toBe(0);
});

it('reveals the neighbouring tab for a swipe without keeping it unless it is opened', async () => {
  render(<Harness />);
  expect(panel('/story')).toBeNull();

  await act(() => setPrimaryTabPeek('/story'));
  const peeked = panel('/story');
  expect(peeked?.hidden).toBe(false);
  expect(peeked?.dataset.primaryTabPeek).toBe('true');
  expect(peeked?.getAttribute('aria-hidden')).toBe('true');
  expect(peeked?.hasAttribute('inert')).toBe(true);
  expect(peeked?.style.getPropertyValue('--primary-tab-peek-width')).not.toBe(
    '',
  );
  // The current tab stays the only interactive one.
  expect(panel('/today')?.hidden).toBe(false);
  expect(panel('/today')?.hasAttribute('data-primary-tab-peek')).toBe(false);

  // A cancelled swipe unmounts the tab that was never opened.
  await act(() => setPrimaryTabPeek(null));
  expect(panel('/story')).toBeNull();

  // A committed swipe turns the peeked panel into the active, kept tab.
  await act(() => setPrimaryTabPeek('/story'));
  const mountedForPeek = mounts.length;
  await act(() => navigate('/story'));
  await act(() => setPrimaryTabPeek(null));
  expect(panel('/story')?.hidden).toBe(false);
  expect(panel('/story')?.hasAttribute('data-primary-tab-peek')).toBe(false);
  expect(panel('/today')?.hidden).toBe(true);
  // The peeked page becomes the active tab without being rebuilt.
  expect(mounts).toHaveLength(mountedForPeek);
});

it('prepares a panel once the app is quiet and keeps it out of sight until visited', async () => {
  vi.useFakeTimers();
  try {
    render(<Harness prewarm={['/plan']} />);
    expect(panel('/plan')).toBeNull();
    // Input keeps resetting the quiet time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_900);
      window.dispatchEvent(new Event('scroll'));
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(panel('/plan')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    const prepared = panel('/plan');
    expect(prepared?.dataset.primaryTabPrewarm).toBe('true');
    expect(prepared?.hidden).toBe(false);
    expect(prepared?.getAttribute('aria-hidden')).toBe('true');
    expect(prepared?.hasAttribute('inert')).toBe(true);
    expect(mounts).toContain('plan');
    const mountsBefore = mounts.filter((name) => name === 'plan').length;

    act(() => navigate('/plan'));
    const visited = panel('/plan');
    expect(visited?.dataset.primaryTabPrewarm).toBeUndefined();
    expect(visited?.hidden).toBe(false);
    expect(visited?.hasAttribute('aria-hidden')).toBe(false);
    // The prepared page is reused, not mounted again.
    expect(mounts.filter((name) => name === 'plan').length).toBe(mountsBefore);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps a queued background mount out of a held gesture and stops listening after it runs', async () => {
  vi.useFakeTimers();
  const idle = vi.fn<(callback: () => void) => number>().mockReturnValue(1);
  vi.stubGlobal('requestIdleCallback', idle);
  try {
    const added = vi.spyOn(window, 'addEventListener');
    render(<Harness prewarm={['/plan']} />);
    const options = added.mock.calls.find(([type]) => type === 'wheel')?.[2];
    const signal = (options as AddEventListenerOptions).signal;
    expect(signal?.aborted).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    const contact = (type: string, count: number) =>
      window.dispatchEvent(
        Object.assign(new Event(type), { touches: { length: count } }),
      );
    contact('touchstart', 1);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    act(() => idle.mock.calls[0][0]());
    expect(panel('/plan')).toBeNull();
    contact('touchend', 0);
    await act(() => vi.advanceTimersByTimeAsync(1_501));
    act(() => idle.mock.calls[1][0]());
    expect(panel('/plan')?.dataset.primaryTabPrewarm).toBe('true');
    expect(signal?.aborted).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it('rechecks visibility and data saving at the idle callback and cancels deactivated work', async () => {
  vi.useFakeTimers();
  const idle = vi.fn<(callback: () => void) => number>().mockReturnValue(1);
  vi.stubGlobal('requestIdleCallback', idle);
  const connection = { saveData: false };
  const original = Object.getOwnPropertyDescriptor(navigator, 'connection');
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection,
  });
  try {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const view = render(<Harness prewarm={['/plan']} />);
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    hidden.mockReturnValue(true);
    act(() => idle.mock.calls[0][0]());
    expect(panel('/plan')).toBeNull();
    hidden.mockReturnValue(false);
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    connection.saveData = true;
    act(() => idle.mock.calls[1][0]());
    expect(panel('/plan')).toBeNull();
    connection.saveData = false;
    view.rerender(<Harness prewarm={['/story']} />);
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    view.rerender(<Harness />);
    act(() => idle.mock.calls[2][0]());
    expect(panel('/story')).toBeNull();
  } finally {
    if (original) Object.defineProperty(navigator, 'connection', original);
    else Reflect.deleteProperty(navigator, 'connection');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
