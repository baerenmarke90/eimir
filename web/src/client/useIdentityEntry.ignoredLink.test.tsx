// @vitest-environment jsdom
//
// #2176 (B): a delivered mailed link that cannot be used must not vanish
// silently. Reproduces the Android test.98 report: the build's API origin
// differed from the host in the mail, so every link was dropped without a word.
import { App } from '@capacitor/app';
import { act, cleanup, renderHook } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as platform from '../pwa';
import { SNACKBAR_EVENT, type SnackbarEventDetail } from './snackbar';
import {
  isIgnoredIdentityLink,
  readIdentityEntryUrl,
  useIdentityEntry,
} from './useIdentityEntry';

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(), getLaunchUrl: vi.fn() },
}));
vi.mock('../pwa', () => ({ isCapacitorNative: vi.fn(() => true) }));

const APP = 'https://app.eimir.de';
const OLD_HOST = 'https://demo.eimir.ur-cloud.de';
let nativeOpen: (event: { url: string }) => void;
let messages: string[];
const onSnackbar = (event: Event) =>
  messages.push((event as CustomEvent<SnackbarEventDetail>).detail.messageKey);

beforeEach(() => {
  vi.resetAllMocks();
  messages = [];
  window.addEventListener(SNACKBAR_EVENT, onSnackbar);
  window.history.replaceState(null, '', '/');
  vi.mocked(platform.isCapacitorNative).mockReturnValue(true);
  vi.mocked(App.getLaunchUrl).mockResolvedValue(undefined);
  vi.mocked(App.addListener).mockImplementation(async (_event, callback) => {
    nativeOpen = callback as unknown as typeof nativeOpen;
    return { remove: vi.fn() };
  });
});
afterEach(() => {
  window.removeEventListener(SNACKBAR_EVENT, onSnackbar);
  cleanup();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <BrowserRouter>{children}</BrowserRouter>
    </StrictMode>
  );
}

async function mount() {
  const view = renderHook(() => useIdentityEntry(APP), { wrapper });
  await act(async () => {});
  return view;
}

describe('classifying a delivered address', () => {
  it.each([
    `${OLD_HOST}/auth/signup#token=abc`,
    `${OLD_HOST}/auth/magic-link#token=abc`,
    `${APP}/auth/recovery`,
    `${APP}/auth/signup?token=a&token=b`,
    `${APP}/auth/oidc/google?code=c`,
    `${APP}/auth/invitation/`,
  ])('treats %s as an ignored identity link', (url) => {
    expect(isIgnoredIdentityLink(url)).toBe(true);
  });

  it.each([
    `${APP}/p/plan-1`,
    `${APP}/more/settings`,
    'de.eimir.app://notifications',
    'de.eimir.app://calendar/google?outcome=connected',
    'not a url',
    `${APP}/auth/other`,
  ])('does not treat %s as an identity link', (url) => {
    expect(isIgnoredIdentityLink(url)).toBe(false);
  });
});

describe('ignored mailed link', () => {
  it('tells the person when the link names another origin, without host or token', async () => {
    const url = `${OLD_HOST}/auth/signup#token=secret-proof`;
    expect(readIdentityEntryUrl(url, APP, true)).toBeNull();
    const { result } = await mount();

    act(() => nativeOpen({ url }));

    expect(result.current.entryToken).toBeNull();
    expect(messages).toEqual(['snackbar.identityLinkUnusable']);
    expect(messages.join()).not.toContain('secret-proof');
  });

  it('also reports an ignored cold-start link', async () => {
    vi.mocked(App.getLaunchUrl).mockResolvedValue({
      url: `${OLD_HOST}/auth/magic-link#token=abc`,
    });
    await mount();
    await act(async () => {});
    expect(messages).toEqual(['snackbar.identityLinkUnusable']);
  });

  it('stays quiet for a usable link, a repeated delivery and non-identity deliveries', async () => {
    const { result } = await mount();
    const url = `${APP}/auth/signup#token=abc`;

    act(() => nativeOpen({ url }));
    expect(result.current.entryToken?.token).toBe('abc');
    act(() => result.current.clearEntryToken());
    act(() => nativeOpen({ url }));
    act(() => nativeOpen({ url: `${APP}/p/plan-1` }));
    act(() => nativeOpen({ url: 'de.eimir.app://notifications' }));

    expect(messages).toEqual([]);
  });
});
