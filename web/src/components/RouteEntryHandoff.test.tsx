// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import { RouteEntryHandoff } from './RouteEntryHandoff';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Scene() {
  const location = useLocation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  return (
    <>
      <RouteEntryHandoff />
      <main>
        <h1>Current destination</h1>
        <button
          type="button"
          onClick={() =>
            navigate('/more/passport/edition', {
              state: { taskOriginKey: captureOrigin() },
            })
          }
        >
          Open reader
        </button>
        <button
          type="button"
          onClick={() =>
            navigate('/more/passport/edition?page=1', {
              replace: true,
              state: { ...location.state, inPlaceRouteUpdate: true },
            })
          }
        >
          Advance in place
        </button>
        <button
          type="button"
          onClick={() =>
            navigate('/more/passport/another', {
              state: { ...location.state, inPlaceRouteUpdate: true },
            })
          }
        >
          Open another destination
        </button>
      </main>
    </>
  );
}

function setup() {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  render(
    <MemoryRouter initialEntries={['/today']}>
      <TaskOriginProvider accountId="account" spaceId="space">
        <Scene />
      </TaskOriginProvider>
    </MemoryRouter>,
  );
  return scroll;
}

it('preserves focus and position for an in-place update with a valid return origin', async () => {
  const user = userEvent.setup();
  const scroll = setup();
  await user.click(screen.getByRole('button', { name: 'Open reader' }));
  const heading = screen.getByRole('heading');
  expect(document.activeElement).toBe(heading);
  const focus = vi.spyOn(heading, 'focus');
  scroll.mockClear();
  const button = screen.getByRole('button', { name: 'Advance in place' });
  await user.click(button);
  expect(scroll).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button);
});

it('does not let an in-place flag suppress handoff to a different destination', async () => {
  const user = userEvent.setup();
  const scroll = setup();
  await user.click(screen.getByRole('button', { name: 'Open reader' }));
  const heading = screen.getByRole('heading');
  const focus = vi.spyOn(heading, 'focus');
  scroll.mockClear();
  await user.click(
    screen.getByRole('button', { name: 'Open another destination' }),
  );
  expect(scroll).toHaveBeenCalledWith(0, 0);
  expect(focus).toHaveBeenCalled();
});
