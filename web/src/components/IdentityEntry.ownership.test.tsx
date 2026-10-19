// @vitest-environment jsdom
import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as identity from '../client/identityFlow';
import type { StoredSession } from '../client/sessionPersistence';
import de from '../i18n/locales/de';
import { IdentityEntry } from './IdentityEntry';

vi.mock('../client/identityFlow', async (original) => ({
  ...(await original<typeof import('../client/identityFlow')>()),
  consumeMagicLink: vi.fn(),
  consumeSignup: vi.fn(),
  signInAndJoinInvitation: vi.fn(),
  revokeUnacceptedSession: vi.fn(async () => {}),
}));
vi.mock('../client/instanceStatus', () => ({
  loadInstanceAccessStatus: vi.fn(async () => ({
    availability: 'available',
    auth: { localPassword: true, magicLink: true, oidc: false, passkey: false },
    selfServiceSignupAvailable: false,
  })),
}));

const apiBaseUrl = 'https://instance.example';
const session: StoredSession = {
  account: { id: 'account-a', displayName: 'Alex' },
  tokens: {
    accessToken: 'unused-access',
    refreshToken: 'unused-refresh',
    accessExpiresAt: new Date('2099-01-01'),
    refreshExpiresAt: new Date('2099-02-01'),
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('identity entry completion ownership', () => {
  it.each(['magicLink', 'signup'] as const)(
    'disposes of a late %s session after leaving the entry',
    async (kind) => {
      const response = deferred<StoredSession>();
      vi.mocked(identity.consumeMagicLink).mockReturnValue(response.promise);
      vi.mocked(identity.consumeSignup).mockReturnValue(
        response.promise.then((value) => ({ ...value, accountCreated: false })),
      );
      const onSession = vi.fn();
      const view = render(
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={{ kind, token: 'old-proof' }}
          onEntryTokenCleared={vi.fn()}
          onSession={onSession}
        />,
      );
      await waitFor(() =>
        expect(
          kind === 'signup'
            ? identity.consumeSignup
            : identity.consumeMagicLink,
        ).toHaveBeenCalledOnce(),
      );
      view.unmount();
      await act(async () => response.resolve(session));
      expect(onSession).not.toHaveBeenCalled();
      expect(identity.revokeUnacceptedSession).toHaveBeenCalledWith(
        apiBaseUrl,
        session,
      );
    },
  );

  it('does not let an older mail response replace a newer proof or its error state', async () => {
    const first = deferred<StoredSession>();
    const second = deferred<StoredSession>();
    vi.mocked(identity.consumeMagicLink)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSession = vi.fn();
    const props = { apiBaseUrl, onSession, onEntryTokenCleared: vi.fn() };
    const view = render(
      <IdentityEntry
        {...props}
        entryToken={{ kind: 'magicLink', token: 'old-proof' }}
      />,
    );
    await waitFor(() =>
      expect(identity.consumeMagicLink).toHaveBeenCalledTimes(1),
    );
    view.rerender(
      <IdentityEntry
        {...props}
        entryToken={{ kind: 'magicLink', token: 'new-proof' }}
      />,
    );
    await waitFor(() =>
      expect(identity.consumeMagicLink).toHaveBeenCalledTimes(2),
    );
    await act(async () => first.reject(new Error('Stale transport error')));
    expect(screen.queryByText(de.identity.magicLinkFailedTitle)).toBeNull();
    await act(async () => second.resolve(session));
    expect(onSession).toHaveBeenCalledExactlyOnceWith(session);
  });

  it('revokes an obsolete successful response while a replacement proof stays active', async () => {
    const first = deferred<StoredSession>();
    const second = deferred<StoredSession>();
    vi.mocked(identity.consumeMagicLink)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSession = vi.fn();
    const props = { apiBaseUrl, onSession, onEntryTokenCleared: vi.fn() };
    const view = render(
      <IdentityEntry
        {...props}
        entryToken={{ kind: 'magicLink', token: 'old-proof' }}
      />,
    );
    await waitFor(() =>
      expect(identity.consumeMagicLink).toHaveBeenCalledTimes(1),
    );
    view.rerender(
      <IdentityEntry
        {...props}
        entryToken={{ kind: 'magicLink', token: 'new-proof' }}
      />,
    );
    await waitFor(() =>
      expect(identity.consumeMagicLink).toHaveBeenCalledTimes(2),
    );
    await act(async () => first.resolve(session));
    expect(onSession).not.toHaveBeenCalled();
    expect(identity.revokeUnacceptedSession).toHaveBeenCalledWith(
      apiBaseUrl,
      session,
    );
    view.unmount();
    await act(async () => second.reject(new Error('Cancelled entry')));
  });

  it('admits one password login and does not commit it after unmount', async () => {
    const response = deferred<StoredSession>();
    vi.mocked(identity.signInAndJoinInvitation).mockReturnValue(
      response.promise,
    );
    const onSession = vi.fn();
    const view = render(
      <IdentityEntry
        apiBaseUrl={apiBaseUrl}
        entryToken={null}
        onEntryTokenCleared={vi.fn()}
        onSession={onSession}
      />,
    );
    await screen.findByLabelText(de.login.email);
    fireEvent.change(screen.getByLabelText(de.login.email), {
      target: { value: 'alex@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText(de.login.password), {
      target: { value: 'fictional-password' },
    });
    const form = screen.getByLabelText(de.login.email).closest('form');
    if (!form) throw new Error('Sign-in form is missing');
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() =>
      expect(identity.signInAndJoinInvitation).toHaveBeenCalledOnce(),
    );
    view.unmount();
    await act(async () => response.resolve(session));
    expect(onSession).not.toHaveBeenCalled();
    expect(identity.revokeUnacceptedSession).toHaveBeenCalledWith(
      apiBaseUrl,
      session,
    );
  });

  it('consumes an automatic proof once under StrictMode and accepts its result', async () => {
    vi.mocked(identity.consumeMagicLink).mockResolvedValue(session);
    const onSession = vi.fn();
    render(
      <StrictMode>
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={{ kind: 'magicLink', token: 'proof' }}
          onEntryTokenCleared={vi.fn()}
          onSession={onSession}
        />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(onSession).toHaveBeenCalledExactlyOnceWith(session),
    );
    expect(identity.consumeMagicLink).toHaveBeenCalledOnce();
    expect(identity.revokeUnacceptedSession).not.toHaveBeenCalled();
  });
});
