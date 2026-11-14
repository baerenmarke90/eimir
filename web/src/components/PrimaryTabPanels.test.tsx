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
import { PrimaryTabPanels } from './PrimaryTabPanels';

let navigate: ReturnType<typeof useNavigate>;
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
  return null;
}

function Harness() {
  return (
    <MemoryRouter initialEntries={['/today']}>
      <TaskOriginProvider accountId="account" spaceId="space">
        <Navigator />
        <PrimaryTabPanels
          fallback={<p>failed</p>}
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

it('restores the scroll position a tab had when it is shown again', async () => {
  render(<Harness />);
  const scrollTo = vi.mocked(window.scrollTo);
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
  window.dispatchEvent(new Event('scroll'));
  await act(() => navigate('/story'));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  await act(() => navigate('/today'));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: 'instant' });
});

it('captures scroll before a new tab can clamp the outgoing document height', async () => {
  render(<Harness />);
  const scrollTo = vi.mocked(window.scrollTo);
  // A fast root navigation may commit before the browser dispatches a scroll
  // event for the most recent reading position.
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 540 });
  await act(() => navigate('/story'));
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  await act(() => navigate('/today'));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 540, behavior: 'instant' });
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

it('keeps restoring while a revealed tab is still settling to its full height', async () => {
  const scroll = clampedScrolling(2000);
  render(<Harness />);
  scroll.setScroll(370);
  await act(() => navigate('/story'));
  // The revealed tab is briefly 46px shorter than when it was left.
  scroll.page.max = 324;
  await act(() => navigate('/today'));
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
  await act(() => navigate('/today'));
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
