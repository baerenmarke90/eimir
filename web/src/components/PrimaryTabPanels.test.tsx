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

it('lets only the visible tab capture a task origin', async () => {
  render(<Harness />);
  await act(() => navigate('/story'));
  await act(() => navigate('/plan'));
  expect(captures.get('story')?.()).toBeNull();
  expect(captures.get('plan')?.()).toMatch(/^task-/);
});
