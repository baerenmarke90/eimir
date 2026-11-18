// @vitest-environment jsdom

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as platform from '../pwa';
import {
  readCalendarGoogleAppReturn,
  useCalendarGoogleAppReturn,
} from './useCalendarGoogleAppReturn';

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(), getLaunchUrl: vi.fn() },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: { close: vi.fn() },
}));
vi.mock('../pwa', () => ({ isCapacitorNative: vi.fn(() => true) }));

const RETURN = 'de.eimir.app://calendar/google?calendarGoogle=connected';
let nativeOpen: (event: { url: string }) => void;
const remove = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(platform.isCapacitorNative).mockReturnValue(true);
  vi.mocked(Browser.close).mockResolvedValue();
  vi.mocked(App.getLaunchUrl).mockResolvedValue(undefined);
  vi.mocked(App.addListener).mockImplementation(async (_event, callback) => {
    nativeOpen = callback as unknown as typeof nativeOpen;
    return { remove };
  });
});
afterEach(cleanup);

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/more']}>{children}</MemoryRouter>;
}

function setup() {
  return renderHook(
    () => {
      useCalendarGoogleAppReturn();
      return useLocation();
    },
    { wrapper },
  );
}

describe('Google Calendar consent return in the app', () => {
  it('accepts only the fixed outcome on the registered callback', () => {
    expect(readCalendarGoogleAppReturn(RETURN)).toBe('connected');
    expect(
      readCalendarGoogleAppReturn(
        'de.eimir.app://calendar/google?calendarGoogle=denied',
      ),
    ).toBe('denied');
    for (const url of [
      'de.eimir.app://calendar/google?calendarGoogle=elsewhere',
      'de.eimir.app://calendar/google?calendarGoogle=connected&code=secret',
      'de.eimir.app://calendar/other?calendarGoogle=connected',
      'de.eimir.app://recent-authentication/oidc?calendarGoogle=connected',
      'https://calendar/google?calendarGoogle=connected',
      'not a url',
    ])
      expect(readCalendarGoogleAppReturn(url), url).toBeNull();
  });

  it('closes the browser and opens the calendar settings with the outcome', async () => {
    const { result } = setup();
    await waitFor(() => expect(App.addListener).toHaveBeenCalled());
    act(() => nativeOpen({ url: RETURN }));
    expect(Browser.close).toHaveBeenCalledOnce();
    expect(result.current.pathname).toBe('/more/settings/calendar');
    expect(result.current.search).toBe('?calendarGoogle=connected');
  });

  it('handles a cold start through the launch URL', async () => {
    vi.mocked(App.getLaunchUrl).mockResolvedValue({ url: RETURN });
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.search).toBe('?calendarGoogle=connected'),
    );
  });

  it('ignores unrelated app links and does nothing on the Web', async () => {
    const { result } = setup();
    await waitFor(() => expect(App.addListener).toHaveBeenCalled());
    act(() =>
      nativeOpen({ url: 'de.eimir.app://recent-authentication/oidc?code=x' }),
    );
    expect(result.current.pathname).toBe('/more');
    expect(Browser.close).not.toHaveBeenCalled();
    cleanup();
    vi.mocked(App.addListener).mockClear();
    vi.mocked(platform.isCapacitorNative).mockReturnValue(false);
    setup();
    expect(App.addListener).not.toHaveBeenCalled();
  });
});
