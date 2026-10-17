// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@capacitor/app';
import { IdentityEntry } from '../components/IdentityEntry';
import { consumeSignup } from './identityFlow';
import { parseNativeEntryLink, useNativeEntryLinks } from './nativeEntryLinks';
import type { SensitiveEntryToken } from './entryToken';

const native = vi.hoisted(() => ({ value: true }));
const subscriptions = vi.hoisted(() => ({
  addListener:
    vi.fn<
      (
        event: 'appUrlOpen',
        receive: (event: { url: string }) => void,
      ) => Promise<{ remove: () => Promise<void> }>
    >(),
}));
vi.mock('../pwa', () => ({ isCapacitorNative: () => native.value }));
vi.mock('@capacitor/app', () => ({
  App: { addListener: subscriptions.addListener, getLaunchUrl: vi.fn() },
}));
vi.mock('./identityFlow', () => ({
  consumeSignup: vi.fn(),
  consumeMagicLink: vi.fn(),
}));
vi.mock('./instanceStatus', () => ({
  loadInstanceAccessStatus: async () => ({
    availability: 'available',
    auth: { localPassword: false, magicLink: true },
    accountCreation: 'self_service',
    selfServiceSignupAvailable: true,
  }),
}));

const origin = 'https://demo.eimir.ur-cloud.de';
const link = (token: string) => `${origin}/auth/signup?token=${token}`;
let listener: (event: { url: string }) => void;
let remove = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  native.value = true;
  remove = vi.fn(async () => undefined);
  subscriptions.addListener.mockImplementation(async (_event, receive) => {
    listener = receive;
    return { remove };
  });
  vi.mocked(App.getLaunchUrl).mockResolvedValue(undefined);
});

function Hook({
  onEntry,
  session = false,
  restoring = false,
}: {
  onEntry: (token: SensitiveEntryToken) => void;
  session?: boolean;
  restoring?: boolean;
}) {
  useNativeEntryLinks(origin, session, restoring, onEntry);
  return null;
}

describe('native email entry boundaries', () => {
  it('accepts every existing same-origin email path and rejects untrusted or ambiguous links', () => {
    for (const [path, kind] of [
      ['signup', 'signup'],
      ['magic-link', 'magicLink'],
      ['invitation', 'invitation'],
      ['verify-email', 'emailVerification'],
      ['recovery', 'recovery'],
    ])
      expect(
        parseNativeEntryLink(`${origin}/auth/${path}?token=proof`, origin),
      ).toEqual({ kind, token: 'proof' });
    for (const invalid of [
      link(''),
      `${link('a')}&token=b`,
      `${link('a')}&returnTo=https://evil.test`,
      `${link('a')}#x`,
      'http://demo.eimir.ur-cloud.de/auth/signup?token=a',
      'https://other.test/auth/signup?token=a',
      'https://user@demo.eimir.ur-cloud.de/auth/signup?token=a',
      `${origin}/auth/oidc/callback?token=a`,
      `${origin}:8443/auth/signup?token=a`,
      link('a'.repeat(4097)),
      ` ${link('a')}`,
      `${origin}/auth/signup?token=a\nb`,
    ])
      expect(parseNativeEntryLink(invalid, origin)).toBeNull();
    expect(parseNativeEntryLink(link('a'), 'not-an-origin')).toBeNull();
  });

  it('delivers a cold launch once under StrictMode and removes every subscription', async () => {
    const onEntry = vi.fn();
    vi.mocked(App.getLaunchUrl).mockResolvedValue({ url: link('cold') });
    const view = render(
      <StrictMode>
        <Hook onEntry={onEntry} />
      </StrictMode>,
    );
    await waitFor(() => expect(onEntry).toHaveBeenCalledOnce());
    act(() => listener({ url: link('cold') }));
    expect(onEntry).toHaveBeenCalledOnce();
    view.unmount();
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
  });

  it('does not let an older launch snapshot replace a live link', async () => {
    let resolve!: (value: { url: string }) => void;
    vi.mocked(App.getLaunchUrl).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onEntry = vi.fn();
    render(<Hook onEntry={onEntry} />);
    await waitFor(() => expect(App.getLaunchUrl).toHaveBeenCalled());
    act(() => listener({ url: link('live') }));
    await waitFor(() =>
      expect(onEntry).toHaveBeenCalledWith({ kind: 'signup', token: 'live' }),
    );
    await act(async () => resolve({ url: link('old') }));
    expect(onEntry).toHaveBeenCalledOnce();
  });

  it('waits for session restore and protects an active account and its drafts', async () => {
    const onEntry = vi.fn();
    const view = render(<Hook onEntry={onEntry} restoring />);
    act(() => listener({ url: link('proof') }));
    expect(onEntry).not.toHaveBeenCalled();
    view.rerender(<Hook onEntry={onEntry} session />);
    await act(async () => undefined);
    expect(onEntry).not.toHaveBeenCalled();
    view.rerender(<Hook onEntry={onEntry} />);
    act(() => listener({ url: link('next') }));
    await waitFor(() =>
      expect(onEntry).toHaveBeenCalledWith({ kind: 'signup', token: 'next' }),
    );
  });

  it('removes late subscriptions and ignores URLs after unmount', async () => {
    let resolve!: (value: { remove: typeof remove }) => void;
    subscriptions.addListener.mockImplementation((_event, receive) => {
      listener = receive;
      return new Promise((done) => {
        resolve = done;
      });
    });
    const onEntry = vi.fn();
    const view = render(<Hook onEntry={onEntry} />);
    view.unmount();
    await act(async () => {
      resolve({ remove });
      listener({ url: link('late') });
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(onEntry).not.toHaveBeenCalled();
  });

  it('has no native subscription in ordinary Web', () => {
    native.value = false;
    render(<Hook onEntry={vi.fn()} />);
    expect(App.addListener).not.toHaveBeenCalled();
  });

  it('routes a mailed proof into the existing IdentityEntry signup consumer', async () => {
    const session = {
      account: { id: 'account' },
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
    };
    vi.mocked(consumeSignup).mockResolvedValue({
      ...session,
      accountCreated: true,
    } as Awaited<ReturnType<typeof consumeSignup>>);
    const onSession = vi.fn();
    function Entry() {
      const [token, setToken] = useState<SensitiveEntryToken | null>(null);
      useNativeEntryLinks(origin, false, false, setToken);
      return (
        <IdentityEntry
          apiBaseUrl={origin}
          entryToken={token}
          onEntryTokenCleared={() => undefined}
          onSession={onSession}
        />
      );
    }
    render(<Entry />);
    act(() => listener({ url: link('mailed-proof') }));
    await waitFor(() =>
      expect(consumeSignup).toHaveBeenCalledWith(origin, 'mailed-proof'),
    );
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(session));
  });
});
