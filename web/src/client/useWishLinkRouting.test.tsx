// @vitest-environment jsdom

import { App } from '@capacitor/app';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as config from './config';
import { useDocumentLeaveGuard } from './useDocumentLeaveGuard';
import { readWishLinkUrl, useWishLinkRouting } from './useWishLinkRouting';

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(), getLaunchUrl: vi.fn() },
}));
vi.mock('./config', () => ({ isCapacitorNativePlatform: vi.fn(() => true) }));

const ORIGIN = 'https://instance.example';
const WISH = `${ORIGIN}/plan/wishes/6f1c2d3e-aaaa-bbbb-cccc-1234567890ab`;
const PATH = '/plan/wishes/6f1c2d3e-aaaa-bbbb-cccc-1234567890ab';
let nativeOpen: (event: { url: string }) => void;
const remove = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
  vi.mocked(config.isCapacitorNativePlatform).mockReturnValue(true);
  vi.mocked(App.getLaunchUrl).mockResolvedValue(undefined);
  vi.mocked(App.addListener).mockImplementation(async (_event, callback) => {
    nativeOpen = callback as unknown as typeof nativeOpen;
    return { remove };
  });
});
afterEach(cleanup);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <BrowserRouter>{children}</BrowserRouter>
    </StrictMode>
  );
}

describe('readWishLinkUrl', () => {
  it('accepts only the canonical Wish path on the instance origin', () => {
    expect(readWishLinkUrl(WISH, ORIGIN)).toBe(PATH);
  });

  it.each([
    [`${WISH}?x=1`],
    [`${WISH}#frag`],
    [`${WISH}/`],
    [`${WISH}/edit`],
    [`${ORIGIN}/plan/wishes/new`],
    [`${ORIGIN}/plan/wishes/`],
    [`${ORIGIN}/plan/plans/abc`],
    [`${ORIGIN}/auth/signup?token=x`],
    [`https://other.example${PATH}`],
    [`http://instance.example${PATH}`],
    [`https://user:pw@instance.example${PATH}`],
    [`https://instance.example${PATH}\\..`],
    [`https://instance.example/plan/wishes/%2e%2e`],
    ['javascript:alert(1)'],
    ['de.eimir.app://plan/wishes/abc'],
    [`${WISH}${'a'.repeat(3000)}`],
  ])('ignores %s', (url) => {
    expect(readWishLinkUrl(url, ORIGIN)).toBeNull();
  });

  it('never routes for a cleartext instance origin', () => {
    expect(
      readWishLinkUrl(
        `http://instance.example${PATH}`,
        'http://instance.example',
      ),
    ).toBeNull();
  });
});

describe('useWishLinkRouting', () => {
  function setup(blocked = false) {
    return renderHook(
      () => {
        useWishLinkRouting(ORIGIN);
        useDocumentLeaveGuard(blocked);
        return useLocation();
      },
      { wrapper },
    );
  }

  it('opens a link tapped while the app is running', async () => {
    const view = setup();
    await waitFor(() => expect(App.addListener).toHaveBeenCalled());
    act(() => nativeOpen({ url: WISH }));
    await waitFor(() => expect(view.result.current.pathname).toBe(PATH));
  });

  it('opens the link that launched the app once', async () => {
    vi.mocked(App.getLaunchUrl).mockResolvedValue({ url: WISH });
    const view = setup();
    await waitFor(() => expect(view.result.current.pathname).toBe(PATH));
    expect(window.history.length).toBeLessThan(4);
  });

  it('does not navigate for unrelated or malformed links', async () => {
    const view = setup();
    await waitFor(() => expect(App.addListener).toHaveBeenCalled());
    act(() => nativeOpen({ url: `${ORIGIN}/plan/wishes/new` }));
    act(() => nativeOpen({ url: `https://other.example${PATH}` }));
    expect(view.result.current.pathname).toBe('/');
  });

  it('waits while an editor holds unsaved work', async () => {
    const view = setup(true);
    await waitFor(() => expect(App.addListener).toHaveBeenCalled());
    act(() => nativeOpen({ url: WISH }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.result.current.pathname).toBe('/');
  });

  it('stays inactive in a browser', async () => {
    vi.mocked(config.isCapacitorNativePlatform).mockReturnValue(false);
    setup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(App.addListener).not.toHaveBeenCalled();
  });
});
