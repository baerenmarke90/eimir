// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityFlow from '../client/identityFlow';
import * as instanceStatus from '../client/instanceStatus';
import * as oidcSignIn from '../client/oidcSignIn';
import * as passkeys from '../client/passkeys';
import * as pwa from '../pwa';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import { IdentityEntry } from './IdentityEntry';
import { BUNDLED_TERMS_VERSION } from './TermsAcceptanceField';

const apiBaseUrl = 'https://eimir.invalid';
const GOOGLE = {
  id: 'google',
  brand: 'google' as const,
  label: '',
  nativeAvailable: true,
};

function cloudStatus(
  overrides: Partial<instanceStatus.InstanceStatusResult> = {},
): instanceStatus.InstanceStatusResult {
  return {
    availability: 'available',
    auth: { localPassword: false, magicLink: true, oidc: true, passkey: true },
    accountCreation: 'self_service',
    selfServiceSignupAvailable: true,
    maintenanceMode: false,
    registrationAvailable: true,
    termsOfUseVersion: BUNDLED_TERMS_VERSION,
    oidcConnections: [GOOGLE],
    oidcSignupAvailable: true,
    ...overrides,
  };
}

function renderEntry(props: Partial<Parameters<typeof IdentityEntry>[0]> = {}) {
  const onSession = vi.fn();
  const onEntryTokenCleared = vi.fn();
  render(
    <IdentityEntry
      apiBaseUrl={apiBaseUrl}
      entryToken={null}
      onEntryTokenCleared={onEntryTokenCleared}
      onSession={onSession}
      {...props}
    />,
  );
  return { onSession, onEntryTokenCleared };
}

describe('IdentityEntry providers and passkeys', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(passkeys, 'passkeysAvailable').mockReturnValue(true);
  });
  afterEach(() => cleanup());

  it('offers Google and a passkey above the one e-mail action', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus(),
    );
    renderEntry();

    expect(
      await screen.findByRole('button', { name: de.identity.googleContinue }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: de.identity.passkeySignIn }),
    ).toBeDefined();
    expect(screen.getByText(de.identity.dividerEmailLink)).toBeDefined();
    // The e-mail form keeps the only filled submit action.
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('type') === 'submit'),
    ).toHaveLength(1);
  });

  it('offers only providers with a native callback in the Android app', async () => {
    vi.spyOn(pwa, 'isCapacitorNative').mockReturnValue(true);
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus({
        oidcConnections: [
          GOOGLE,
          {
            id: 'pocket',
            brand: 'generic',
            label: 'Pocket ID',
            nativeAvailable: false,
          },
        ],
      }),
    );
    renderEntry();

    expect(
      await screen.findByRole('button', { name: de.identity.googleContinue }),
    ).toBeDefined();
    expect(
      screen.queryByText(
        de.identity.providerContinue.replace('{{name}}', 'Pocket ID'),
      ),
    ).toBeNull();
  });

  it('offers nothing extra where no provider is configured', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus({ oidcConnections: [], oidcSignupAvailable: false }),
    );
    vi.mocked(passkeys.passkeysAvailable).mockReturnValue(false);
    renderEntry();

    await screen.findByLabelText(de.login.email);
    expect(
      screen.queryByRole('button', { name: de.identity.googleContinue }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: de.identity.passkeySignIn }),
    ).toBeNull();
  });

  it('signs in with Google without creating an account', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus(),
    );
    const start = vi
      .spyOn(oidcSignIn, 'startOidcSignIn')
      .mockResolvedValue('https://accounts.google.example/authorize?x=1');
    const leave = vi.spyOn(oidcSignIn, 'goToProvider').mockResolvedValue();
    renderEntry();

    fireEvent.click(
      await screen.findByRole('button', { name: de.identity.googleContinue }),
    );
    await waitFor(() => expect(leave).toHaveBeenCalled());
    expect(start).toHaveBeenCalledWith(apiBaseUrl, 'google', {
      signup: false,
      acceptedTermsVersion: null,
      invitationToken: null,
    });
    expect(leave).toHaveBeenCalledWith(
      'https://accounts.google.example/authorize?x=1',
    );
  });

  it('needs the terms before Google may create an account', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus(),
    );
    const start = vi
      .spyOn(oidcSignIn, 'startOidcSignIn')
      .mockResolvedValue('https://accounts.google.example/authorize');
    vi.spyOn(oidcSignIn, 'goToProvider').mockResolvedValue();
    renderEntry();

    fireEvent.click(
      await screen.findByRole('button', { name: de.identity.startTogether }),
    );
    const google = await screen.findByRole('button', {
      name: de.identity.googleSignUp,
    });
    expect((google as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(de.identity.providerTermsFirst)).toBeDefined();
    // A passkey needs an account first, so signup does not offer one.
    expect(
      screen.queryByRole('button', { name: de.identity.passkeySignIn }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('checkbox'));
    expect((google as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(google);

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(start).toHaveBeenCalledWith(apiBaseUrl, 'google', {
      signup: true,
      acceptedTermsVersion: BUNDLED_TERMS_VERSION,
      invitationToken: null,
    });
  });

  it('does not offer Google signup where only sign-in is possible', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus({ oidcSignupAvailable: false }),
    );
    renderEntry();

    fireEvent.click(
      await screen.findByRole('button', { name: de.identity.startTogether }),
    );
    await screen.findByLabelText(de.login.email);
    expect(
      screen.queryByRole('button', { name: de.identity.googleSignUp }),
    ).toBeNull();
  });

  it('signs in with a passkey and ignores a cancelled dialog', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus(),
    );
    const session = {
      account: { id: 'acc-1', displayName: 'Mara' },
      tokens: { accessToken: 'a', refreshToken: 'r' },
    };
    const signIn = vi
      .spyOn(passkeys, 'signInWithPasskey')
      .mockRejectedValueOnce(new passkeys.PasskeyCancelledError())
      .mockResolvedValueOnce(session as never);
    const { onSession } = renderEntry();

    await screen.findByRole('button', { name: de.identity.googleContinue });
    const button = screen.getByRole('button', {
      name: de.identity.passkeySignIn,
    });
    fireEvent.click(button);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(onSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(button);
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(session));
  });

  it('completes the return from the provider', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus(),
    );
    const session = {
      account: { id: 'acc-1', displayName: 'Mara' },
      tokens: { accessToken: 'a', refreshToken: 'r' },
    };
    const complete = vi
      .spyOn(oidcSignIn, 'completeOidcSignIn')
      .mockResolvedValue(session as never);
    const { onSession } = renderEntry({
      entryToken: {
        kind: 'oidc',
        token: 'state-1',
        connectionId: 'google',
        code: 'code-1',
        providerError: false,
      },
    });

    await waitFor(() => expect(onSession).toHaveBeenCalledWith(session));
    expect(complete).toHaveBeenCalledWith(
      apiBaseUrl,
      'google',
      'code-1',
      'state-1',
    );
  });

  it('explains a refused signup for an address that already has an account', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus(),
    );
    vi.spyOn(oidcSignIn, 'completeOidcSignIn').mockRejectedValue(
      new ClientProblemError(
        'conflict',
        409,
        'OIDC_ADDRESS_ALREADY_REGISTERED',
      ),
    );
    renderEntry({
      entryToken: {
        kind: 'oidc',
        token: 'state-1',
        connectionId: 'google',
        code: 'code-1',
        providerError: false,
      },
    });

    expect(
      await screen.findByText(de.identity.oidcAddressTakenTitle),
    ).toBeDefined();
    expect(screen.getByText(de.identity.oidcAddressTakenBody)).toBeDefined();
    expect(
      screen.getByRole('button', { name: de.identity.backToSignIn }),
    ).toBeDefined();
  });

  it('returns quietly to the form when the person declined at the provider', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus(),
    );
    const complete = vi.spyOn(oidcSignIn, 'completeOidcSignIn');
    const { onEntryTokenCleared } = renderEntry({
      entryToken: {
        kind: 'oidc',
        token: 'state-1',
        connectionId: 'google',
        code: null,
        providerError: true,
      },
    });

    await waitFor(() => expect(onEntryTokenCleared).toHaveBeenCalled());
    expect(complete).not.toHaveBeenCalled();
  });

  it('says the details are wrong, not that the session expired, after a wrong password', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus({
        auth: {
          localPassword: true,
          magicLink: true,
          oidc: false,
          passkey: false,
        },
        accountCreation: 'invitation',
        selfServiceSignupAvailable: false,
        termsOfUseVersion: null,
        oidcConnections: [],
        oidcSignupAvailable: false,
      }),
    );
    vi.spyOn(identityFlow, 'signInAndJoinInvitation').mockRejectedValue(
      new ClientProblemError('unauthorized', 401, 'INVALID_CREDENTIALS'),
    );
    renderEntry();

    fireEvent.change(await screen.findByLabelText(de.login.email), {
      target: { value: 'mara@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText(de.login.password), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: de.login.submit }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      de.login.errorFallback,
    );
    expect(screen.queryByText(de.states.session.title)).toBeNull();
  });

  it('keeps forgot-password as a text action, not a second filled button', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
      cloudStatus({
        auth: {
          localPassword: true,
          magicLink: true,
          oidc: false,
          passkey: false,
        },
        accountCreation: 'invitation',
        selfServiceSignupAvailable: false,
        oidcConnections: [],
      }),
    );
    renderEntry();

    const forgot = await screen.findByRole('button', {
      name: de.identity.forgotPassword,
    });
    expect(forgot.className).toContain('tertiary');
  });
});
