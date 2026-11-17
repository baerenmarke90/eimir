// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as instanceStatus from '../client/instanceStatus';
import * as oidcSignIn from '../client/oidcSignIn';
import * as passkeys from '../client/passkeys';
import { ClientProblemError } from '../client/problemDetails';
import * as signInMethods from '../client/signInMethods';
import accountSettings from '../i18n/locales/accountSettings';
import { SignInMethodsPanel } from './SignInMethodsPanel';

const API = 'https://eimir.invalid';

type Methods = Awaited<ReturnType<typeof signInMethods.loadSignInMethods>>;

function methods(overrides: Partial<Methods> = {}): Methods {
  return {
    passkeys: [
      {
        id: 'pk-1',
        name: 'Pixel',
        createdAt: new Date('2026-11-17T10:00:00Z'),
      },
    ],
    oidc: [],
    emailLink: true,
    localPassword: false,
    ...overrides,
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SignInMethodsPanel
        apiBaseUrl={API}
        accessToken="token"
        accountId="acc-1"
        spaceId="space-1"
      />
    </QueryClientProvider>,
  );
}

describe('SignInMethodsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(passkeys, 'passkeysAvailable').mockReturnValue(true);
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
      availability: 'available',
      auth: {
        localPassword: false,
        magicLink: true,
        oidc: true,
        passkey: true,
      },
      accountCreation: 'self_service',
      selfServiceSignupAvailable: true,
      maintenanceMode: false,
      registrationAvailable: true,
      termsOfUseVersion: null,
      oidcConnections: [
        { id: 'google', brand: 'google', label: '', nativeAvailable: true },
      ],
      oidcSignupAvailable: true,
    });
  });
  afterEach(() => cleanup());

  it('lists the ways into the account', async () => {
    vi.spyOn(signInMethods, 'loadSignInMethods').mockResolvedValue(methods());
    renderPanel();

    expect(
      await screen.findByText(accountSettings.emailLinkTitle),
    ).toBeDefined();
    expect(await screen.findByText(accountSettings.googleTitle)).toBeDefined();
    expect(screen.getByText(accountSettings.providerNotLinked)).toBeDefined();
    expect(screen.getByText('Pixel')).toBeDefined();
    expect(
      screen.getByRole('button', { name: accountSettings.passkeyAdd }),
    ).toBeDefined();
  });

  it('adds a passkey and reloads the list', async () => {
    const load = vi
      .spyOn(signInMethods, 'loadSignInMethods')
      .mockResolvedValue(methods());
    const register = vi.spyOn(passkeys, 'registerPasskey').mockResolvedValue();
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', { name: accountSettings.passkeyAdd }),
    );
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        API,
        'token',
        accountSettings.passkeyDefaultName,
      ),
    );
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText(accountSettings.passkeyAddedMessage),
    ).toBeDefined();
  });

  it('does not report a cancelled passkey dialog as an error', async () => {
    vi.spyOn(signInMethods, 'loadSignInMethods').mockResolvedValue(methods());
    const register = vi
      .spyOn(passkeys, 'registerPasskey')
      .mockRejectedValue(new passkeys.PasskeyCancelledError());
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', { name: accountSettings.passkeyAdd }),
    );
    await waitFor(() => expect(register).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: accountSettings.passkeyAdd,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks twice before removing a passkey', async () => {
    vi.spyOn(signInMethods, 'loadSignInMethods').mockResolvedValue(methods());
    const remove = vi.spyOn(signInMethods, 'removePasskey').mockResolvedValue();
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', {
        name: accountSettings.passkeyRemove,
      }),
    );
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: accountSettings.passkeyRemoveConfirm,
      }),
    );
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(API, 'token', 'pk-1'),
    );
  });

  it('explains that the last way in cannot be removed', async () => {
    vi.spyOn(signInMethods, 'loadSignInMethods').mockResolvedValue(
      methods({ emailLink: false }),
    );
    vi.spyOn(signInMethods, 'removePasskey').mockRejectedValue(
      new ClientProblemError('conflict', 409, 'SIGN_IN_METHOD_LAST'),
    );
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', {
        name: accountSettings.passkeyRemove,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: accountSettings.passkeyRemoveConfirm,
      }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      accountSettings.lastMethod,
    );
  });

  it('links Google and leaves for the provider', async () => {
    vi.spyOn(signInMethods, 'loadSignInMethods').mockResolvedValue(methods());
    const start = vi
      .spyOn(oidcSignIn, 'startOidcLink')
      .mockResolvedValue('https://accounts.google.example/authorize');
    const leave = vi.spyOn(oidcSignIn, 'goToProvider').mockReturnValue();
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', { name: accountSettings.providerLink }),
    );
    await waitFor(() => expect(leave).toHaveBeenCalled());
    expect(start).toHaveBeenCalledWith(API, 'token', 'google');
  });

  it('unlinks Google after a confirmation', async () => {
    vi.spyOn(signInMethods, 'loadSignInMethods').mockResolvedValue(
      methods({
        oidc: [{ connectionId: 'google', linkedAt: new Date('2026-11-17') }],
      }),
    );
    const unlink = vi
      .spyOn(signInMethods, 'unlinkProvider')
      .mockResolvedValue();
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', {
        name: accountSettings.providerUnlink,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: accountSettings.providerUnlinkConfirm,
      }),
    );
    await waitFor(() =>
      expect(unlink).toHaveBeenCalledWith(API, 'token', 'google'),
    );
  });

  it('does not offer passkeys where this client cannot run the ceremony', async () => {
    vi.mocked(passkeys.passkeysAvailable).mockReturnValue(false);
    vi.spyOn(signInMethods, 'loadSignInMethods').mockResolvedValue(methods());
    renderPanel();

    await screen.findByText(accountSettings.emailLinkTitle);
    expect(
      screen.queryByRole('button', { name: accountSettings.passkeyAdd }),
    ).toBeNull();
    expect(
      screen.getByText(accountSettings.passkeyNotOnThisDevice),
    ).toBeDefined();
  });
});
