// @vitest-environment jsdom

import { App } from '@capacitor/app';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as platform from '../pwa';
import { useDocumentLeaveGuard } from './useDocumentLeaveGuard';
import { readIdentityEntryUrl, useIdentityEntry } from './useIdentityEntry';

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(), getLaunchUrl: vi.fn() },
}));
vi.mock('../pwa', () => ({ isCapacitorNative: vi.fn(() => false) }));

const ORIGIN = 'https://instance.example';
let nativeOpen: (event: { url: string }) => void;
const remove = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
  vi.mocked(platform.isCapacitorNative).mockReturnValue(false);
  vi.mocked(App.getLaunchUrl).mockResolvedValue(undefined);
  vi.mocked(App.addListener).mockImplementation(async (_event, callback) => {
    nativeOpen = callback as unknown as typeof nativeOpen;
    return { remove };
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'launchQueue');
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <BrowserRouter>{children}</BrowserRouter>
    </StrictMode>
  );
}
function setup() {
  return renderHook(
    () => ({
      ...useIdentityEntry(ORIGIN),
      navigate: useNavigate(),
    }),
    { wrapper },
  );
}

describe('trusted external identity URLs', () => {
  it('uses the canonical parser including pre-upgrade invitation fragments', () => {
    expect(
      readIdentityEntryUrl(
        `${ORIGIN}/auth/signup?token=proof#invitationToken=invite`,
        ORIGIN,
      ),
    ).toEqual({
      kind: 'signup',
      token: 'proof',
      invitationToken: 'invite',
    });
  });
  it.each([
    'https://instance.example.evil/auth/signup?token=proof',
    'https://other.example/auth/signup?token=proof',
    'http://instance.example/auth/signup?token=proof',
    'https://instance.example:444/auth/signup?token=proof',
    'https://user:password@instance.example/auth/signup?token=proof',
    'de.eimir.app://recent-authentication/oidc?token=proof',
    'javascript:alert(1)',
    '/auth/signup?token=proof',
    `${ORIGIN}/story?token=proof`,
    `${ORIGIN}/auth/signup`,
    `${ORIGIN}/auth/signup?token=a&token=b`,
    `${ORIGIN}/auth/signup?token=a&returnTo=https://evil.example`,
    `${ORIGIN}/auth/signup?token=a#other=invite`,
    `${ORIGIN}/auth/signup?token=a#invitationToken=x&invitationToken=y`,
    `${ORIGIN}/auth/signup?token=a#invitationToken=x&other=y`,
    `${ORIGIN}/auth/invitation?token=a#invitationToken=x`,
    `${ORIGIN}/auth/signup?token=${'a'.repeat(4097)}`,
    ` ${ORIGIN}/auth/signup?token=a`,
    `${ORIGIN}/auth/signup?token=a\nb`,
  ])('ignores an untrusted or unrelated URL: %s', (url) => {
    expect(readIdentityEntryUrl(url, ORIGIN)).toBeNull();
  });
  it('requires HTTPS for native entry while allowing a local browser origin', () => {
    const url = 'http://localhost/auth/signup?token=proof';
    expect(readIdentityEntryUrl(url, 'http://localhost', true)).toBeNull();
    expect(readIdentityEntryUrl(url, 'http://localhost')).toEqual({
      kind: 'signup',
      token: 'proof',
    });
  });
});

describe('running identity entry lifecycle', () => {
  it('retains an external proof without interrupting drafts until every leave guard is released', async () => {
    vi.mocked(platform.isCapacitorNative).mockReturnValue(true);
    window.history.replaceState(null, '', '/more/settings');
    const view = renderHook(
      ({ dirty, saving }) => {
        useDocumentLeaveGuard(dirty);
        useDocumentLeaveGuard(saving);
        return useIdentityEntry(ORIGIN);
      },
      { wrapper, initialProps: { dirty: true, saving: true } },
    );
    act(() => nativeOpen({ url: `${ORIGIN}/auth/signup?token=proof` }));
    expect(view.result.current.entryToken).toBeNull();
    expect(window.location.pathname).toBe('/more/settings');
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    view.rerender({ dirty: false, saving: true });
    expect(view.result.current.entryToken).toBeNull();
    view.rerender({ dirty: false, saving: false });
    await waitFor(() =>
      expect(view.result.current.entryToken).toEqual({
        kind: 'signup',
        token: 'proof',
      }),
    );
    expect(window.location.pathname).toBe('/');
  });
  it('keeps ordinary route intake usable if native launch APIs are unavailable', async () => {
    vi.mocked(platform.isCapacitorNative).mockReturnValue(true);
    vi.mocked(App.addListener).mockRejectedValue(
      new Error('Plugin unavailable'),
    );
    vi.mocked(App.getLaunchUrl).mockRejectedValue(
      new Error('Plugin unavailable'),
    );
    const { result } = setup();
    await act(async () => {});
    act(() => result.current.navigate('/auth/invitation?token=invite'));
    expect(result.current.entryToken).toEqual({
      kind: 'invitation',
      token: 'invite',
    });
  });

  it('captures and scrubs new router entries without losing the proof on cleanup navigation', async () => {
    const { result } = setup();
    act(() => result.current.navigate('/auth/signup?token=proof#from=mail'));
    await waitFor(() =>
      expect(result.current.entryToken).toEqual({
        kind: 'signup',
        token: 'proof',
      }),
    );
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    act(() => result.current.clearEntryToken());
    expect(result.current.entryToken).toBeNull();
  });

  it('captures native cold start once, does not replay it on navigation, and receives a later warm link', async () => {
    vi.mocked(platform.isCapacitorNative).mockReturnValue(true);
    vi.mocked(App.getLaunchUrl).mockResolvedValue({
      url: `${ORIGIN}/auth/signup?token=cold`,
    });
    const { result, unmount } = setup();
    await waitFor(() => expect(result.current.entryToken?.token).toBe('cold'));
    const launchReads = vi.mocked(App.getLaunchUrl).mock.calls.length;
    act(() => result.current.clearEntryToken());
    act(() => result.current.navigate('/more/settings'));
    expect(result.current.entryToken).toBeNull();
    expect(App.getLaunchUrl).toHaveBeenCalledTimes(launchReads);
    act(() => nativeOpen({ url: `${ORIGIN}/auth/signup?token=warm` }));
    expect(result.current.entryToken?.token).toBe('warm');
    expect(window.location.pathname).toBe('/');
    act(() => result.current.clearEntryToken());
    act(() => nativeOpen({ url: `${ORIGIN}/auth/signup?token=warm` }));
    expect(result.current.entryToken).toBeNull();
    const subscriptions = vi.mocked(App.addListener).mock.calls.length;
    unmount();
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(subscriptions));
  });

  it('keeps a newly delivered warm entry when an older launch lookup finishes afterwards', async () => {
    vi.mocked(platform.isCapacitorNative).mockReturnValue(true);
    let resolveLaunch: (value: { url: string }) => void = () => {};
    vi.mocked(App.getLaunchUrl).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLaunch = resolve;
        }),
    );
    const { result } = setup();
    await waitFor(() => expect(App.getLaunchUrl).toHaveBeenCalled());
    act(() => nativeOpen({ url: `${ORIGIN}/auth/signup?token=newer` }));
    await act(async () =>
      resolveLaunch({ url: `${ORIGIN}/auth/signup?token=stale` }),
    );
    expect(result.current.entryToken?.token).toBe('newer');
  });

  it('receives trusted PWA launch targets, deduplicates delivery, and ignores callbacks after unmount', () => {
    let launch: (params: { targetURL?: string }) => void = () => {};
    Object.defineProperty(window, 'launchQueue', {
      configurable: true,
      value: {
        setConsumer(consumer: typeof launch) {
          launch = consumer;
        },
      },
    });
    const { result, unmount } = setup();
    act(() =>
      launch({
        targetURL: `${window.location.origin}/auth/invitation?token=invite`,
      }),
    );
    expect(result.current.entryToken).toEqual({
      kind: 'invitation',
      token: 'invite',
    });
    act(() => result.current.clearEntryToken());
    act(() =>
      launch({
        targetURL: `${window.location.origin}/auth/invitation?token=invite`,
      }),
    );
    expect(result.current.entryToken).toBeNull();
    act(() =>
      launch({ targetURL: 'https://evil.example/auth/signup?token=evil' }),
    );
    expect(result.current.entryToken).toBeNull();
    unmount();
    act(() =>
      launch({ targetURL: `${window.location.origin}/auth/signup?token=late` }),
    );
    expect(window.location.pathname).toBe('/');
  });
});
