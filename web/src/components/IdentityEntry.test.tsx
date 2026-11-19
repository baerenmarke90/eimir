// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityFlow from '../client/identityFlow';
import * as instanceStatus from '../client/instanceStatus';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import legal from '../i18n/locales/legal';
import { IdentityEntry } from './IdentityEntry';
import { BUNDLED_TERMS_VERSION } from './TermsAcceptanceField';

interface CustomMatchers<R = unknown> {
  toHaveFocus(): R;
}

declare module 'vitest' {
  interface Assertion<R extends void | Promise<void> = void, T = unknown>
    extends CustomMatchers<R> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  toHaveFocus(received: HTMLElement) {
    const pass = document.activeElement === received;
    return {
      pass,
      message: () =>
        pass
          ? 'expected element not to have focus'
          : `expected element to have focus, but activeElement is ${document.activeElement?.outerHTML ?? 'null'}`,
    };
  },
});

const ACCEPTANCE_LABEL = legal.accept.replace(/<\/?termsLink>/g, '');
const PRIVACY_NOTICE = legal.privacyNotice.replace(/<\/?privacyLink>/g, '');
const PRIVACY_NOTICE_LINK =
  /<privacyLink>(.*)<\/privacyLink>/.exec(legal.privacyNotice)?.[1] ?? '';

describe('IdentityEntry', () => {
  const apiBaseUrl = 'https://eimir.invalid';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders "Gemeinsam starten" and allows switching modes on Cloud deployment', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
      availability: 'available',
      auth: {
        localPassword: false,
        magicLink: true,
        oidc: false,
        passkey: false,
      },
      accountCreation: 'self_service',
      selfServiceSignupAvailable: true,
      maintenanceMode: false,
      registrationAvailable: true,
      termsOfUseVersion: null,
    });

    render(
      <IdentityEntry
        apiBaseUrl={apiBaseUrl}
        entryToken={null}
        onEntryTokenCleared={vi.fn()}
        onSession={vi.fn()}
      />,
    );

    // Mode group and toggle buttons are accessible
    const modeGroup = await screen.findByRole('group', {
      name: de.identity.entryModesAria,
    });
    expect(modeGroup).toBeDefined();

    const signInToggle = screen.getByRole('button', {
      name: de.login.heading,
    });
    const startTogetherToggle = screen.getByRole('button', {
      name: de.identity.startTogether,
    });

    expect(signInToggle.getAttribute('aria-pressed')).toBe('true');
    expect(startTogetherToggle.getAttribute('aria-pressed')).toBe('false');

    // Click "Gemeinsam starten" toggle
    fireEvent.click(startTogetherToggle);

    // Card switches to "Gemeinsam starten" view and focuses email input
    await screen.findByRole('heading', {
      name: de.identity.startTogetherTitle,
    });
    expect(screen.getByText(de.identity.startTogetherBody)).toBeDefined();
    expect(startTogetherToggle.getAttribute('aria-pressed')).toBe('true');
    expect(signInToggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText(de.login.email)).toHaveFocus();

    // Submit button says "Gemeinsam starten"
    const submitBtns = screen.getAllByRole('button', {
      name: de.identity.startTogetherSubmit,
    });
    const submitBtn = submitBtns.find(
      (b) => b.getAttribute('type') === 'submit',
    );
    expect(submitBtn).toBeDefined();

    // Secondary button offers switching back to sign-in
    const backBtn = screen.getByRole('button', {
      name: de.identity.alreadyRegistered,
    });
    expect(backBtn).toBeDefined();

    // Clicking back returns to sign-in and focuses email input
    fireEvent.click(backBtn);
    await screen.findByRole('heading', { name: de.identity.magicLinkTitle });
    expect(signInToggle.getAttribute('aria-pressed')).toBe('true');
    expect(startTogetherToggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText(de.login.email)).toHaveFocus();
  });

  it('suppresses "Gemeinsam starten" when selfServiceSignupAvailable is false', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
      availability: 'available',
      auth: {
        localPassword: true,
        magicLink: false,
        oidc: false,
        passkey: false,
      },
      accountCreation: 'invitation',
      selfServiceSignupAvailable: false,
      maintenanceMode: false,
      registrationAvailable: true,
      termsOfUseVersion: null,
    });

    render(
      <IdentityEntry
        apiBaseUrl={apiBaseUrl}
        entryToken={null}
        onEntryTokenCleared={vi.fn()}
        onSession={vi.fn()}
      />,
    );

    await screen.findByRole('heading', { name: de.login.heading });
    // Toggle buttons should not exist
    expect(
      screen.queryByRole('button', { name: de.identity.startTogether }),
    ).toBeNull();
  });

  it('submits signup request and displays neutral mailbox notice', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
      availability: 'available',
      auth: {
        localPassword: false,
        magicLink: true,
        oidc: false,
        passkey: false,
      },
      accountCreation: 'self_service',
      selfServiceSignupAvailable: true,
      maintenanceMode: false,
      registrationAvailable: true,
      termsOfUseVersion: null,
    });

    const requestSpy = vi
      .spyOn(identityFlow, 'requestSignup')
      .mockResolvedValue();

    render(
      <IdentityEntry
        apiBaseUrl={apiBaseUrl}
        entryToken={null}
        onEntryTokenCleared={vi.fn()}
        onSession={vi.fn()}
      />,
    );

    // Switch to Gemeinsam starten
    const startTogetherBtn = await screen.findByRole('button', {
      name: de.identity.startTogether,
    });
    fireEvent.click(startTogetherBtn);

    // Fill email
    const emailInput = screen.getByLabelText(de.login.email);
    expect(emailInput).toHaveFocus();
    fireEvent.change(emailInput, {
      target: { value: 'couple@example.invalid' },
    });

    // Submit
    const submitBtns = screen.getAllByRole('button', {
      name: de.identity.startTogetherSubmit,
    });
    const submitBtn = submitBtns.find(
      (b) => b.getAttribute('type') === 'submit',
    );
    expect(submitBtn).toBeDefined();
    if (submitBtn) {
      fireEvent.click(submitBtn);
    }

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(
        apiBaseUrl,
        'couple@example.invalid',
        null,
        null,
      );
    });

    // Shows neutral mail notice and moves focus to status container
    await screen.findByText(de.identity.mailRequestedTitle);
    expect(screen.getByText(de.identity.mailRequestedBody)).toBeDefined();
    const statusBox = screen.getByRole('status');
    expect(statusBox).toHaveFocus();
  });

  it.each([false, true])(
    'requests a Cloud email proof for a new address (invitation: %s)',
    async (fromInvitation) => {
      vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
        availability: 'available',
        auth: {
          localPassword: false,
          magicLink: true,
          oidc: false,
          passkey: false,
        },
        accountCreation: 'self_service',
        selfServiceSignupAvailable: true,
        maintenanceMode: false,
        registrationAvailable: true,
        termsOfUseVersion: null,
      });
      const signupSpy = vi
        .spyOn(identityFlow, 'requestSignup')
        .mockResolvedValue();
      const magicLinkSpy = vi
        .spyOn(identityFlow, 'requestMagicLink')
        .mockResolvedValue();

      render(
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={
            fromInvitation
              ? { kind: 'invitation', token: 'partner-invitation-token' }
              : null
          }
          onEntryTokenCleared={vi.fn()}
          onSession={vi.fn()}
        />,
      );

      await screen.findByRole('heading', {
        name: de.identity.magicLinkTitle,
      });
      fireEvent.change(screen.getByLabelText(de.login.email), {
        target: { value: 'new-partner@example.invalid' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: de.identity.magicLinkRequestSubmit,
        }),
      );

      await screen.findByText(de.identity.mailRequestedTitle);
      expect(signupSpy.mock.calls).toEqual([
        fromInvitation
          ? [
              apiBaseUrl,
              'new-partner@example.invalid',
              'partner-invitation-token',
              null,
            ]
          : [apiBaseUrl, 'new-partner@example.invalid'],
      ]);
      expect(magicLinkSpy).not.toHaveBeenCalled();
      expect(screen.getByText(de.identity.mailRequestedBody)).toBeDefined();
    },
  );

  it('retains existing-account mail requests without self-service signup', async () => {
    vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
      availability: 'available',
      auth: {
        localPassword: true,
        magicLink: true,
        oidc: false,
        passkey: false,
      },
      accountCreation: 'invitation',
      selfServiceSignupAvailable: false,
      maintenanceMode: false,
      registrationAvailable: true,
      termsOfUseVersion: null,
    });
    const signupSpy = vi
      .spyOn(identityFlow, 'requestSignup')
      .mockResolvedValue();
    const magicLinkSpy = vi
      .spyOn(identityFlow, 'requestMagicLink')
      .mockResolvedValue();

    render(
      <IdentityEntry
        apiBaseUrl={apiBaseUrl}
        entryToken={null}
        onEntryTokenCleared={vi.fn()}
        onSession={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: de.identity.useMagicLink }),
    );
    fireEvent.change(screen.getByLabelText(de.login.email), {
      target: { value: 'existing-partner@example.invalid' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: de.identity.magicLinkRequestSubmit,
      }),
    );

    await screen.findByText(de.identity.mailRequestedTitle);
    expect(magicLinkSpy).toHaveBeenCalledWith(
      apiBaseUrl,
      'existing-partner@example.invalid',
    );
    expect(signupSpy).not.toHaveBeenCalled();
  });

  it('consumes valid signup token and starts session', async () => {
    const onSession = vi.fn();
    const consumeSpy = vi
      .spyOn(identityFlow, 'consumeSignup')
      .mockResolvedValue({
        account: { id: 'acc-1', displayName: 'Lea' },
        tokens: {
          accessToken: 'tok-access',
          refreshToken: 'tok-refresh',
          accessExpiresAt: new Date(Date.now() + 3600_000),
          refreshExpiresAt: new Date(Date.now() + 86400_000),
        },
        accountCreated: true,
      });

    render(
      <IdentityEntry
        apiBaseUrl={apiBaseUrl}
        entryToken={{ kind: 'signup', token: 'valid-signup-token' }}
        onEntryTokenCleared={vi.fn()}
        onSession={onSession}
      />,
    );

    await waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledWith(apiBaseUrl, 'valid-signup-token');
      expect(onSession).toHaveBeenCalledWith({
        account: { id: 'acc-1', displayName: 'Lea' },
        tokens: expect.objectContaining({ accessToken: 'tok-access' }),
      });
    });
  });

  it('displays tailored error when signup token is expired/invalid', async () => {
    vi.spyOn(identityFlow, 'consumeSignup').mockRejectedValue(
      new ClientProblemError('validation', 400, 'ACTION_TOKEN_INVALID'),
    );

    render(
      <IdentityEntry
        apiBaseUrl={apiBaseUrl}
        entryToken={{ kind: 'signup', token: 'expired-token' }}
        onEntryTokenCleared={vi.fn()}
        onSession={vi.fn()}
      />,
    );

    await screen.findByText(de.identity.signupFailedTitle);
    expect(screen.getByText(de.identity.signupFailedBody)).toBeDefined();
  });

  it('preserves ProblemState for server-authoritative registration disabled error on signup consume', async () => {
    vi.spyOn(identityFlow, 'consumeSignup').mockRejectedValue(
      new ClientProblemError('permission', 403, 'REGISTRATION_DISABLED'),
    );

    render(
      <IdentityEntry
        apiBaseUrl={apiBaseUrl}
        entryToken={{
          kind: 'signup',
          token: 'valid-token-but-registration-disabled',
        }}
        onEntryTokenCleared={vi.fn()}
        onSession={vi.fn()}
      />,
    );

    // Does not show the expired signup link message
    await waitFor(() => {
      expect(screen.queryByText(de.identity.signupFailedTitle)).toBeNull();
    });
    // Shows standard problem state for permission
    expect(screen.getByText(de.states.permission.title)).toBeDefined();
  });
  describe('terms of use acceptance', () => {
    const cloudWithTerms = {
      availability: 'available' as const,
      auth: {
        localPassword: false,
        magicLink: true,
        oidc: false,
        passkey: false,
      },
      accountCreation: 'self_service' as const,
      selfServiceSignupAvailable: true,
      maintenanceMode: false,
      registrationAvailable: true,
      termsOfUseVersion: BUNDLED_TERMS_VERSION,
    };

    it('requires the acceptance and sends its version with the signup request', async () => {
      vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
        cloudWithTerms,
      );
      const requestSpy = vi
        .spyOn(identityFlow, 'requestSignup')
        .mockResolvedValue();
      render(
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={null}
          onEntryTokenCleared={vi.fn()}
          onSession={vi.fn()}
        />,
      );

      fireEvent.click(
        await screen.findByRole('button', { name: de.identity.startTogether }),
      );
      const acceptance = screen.getByRole('checkbox', {
        name: ACCEPTANCE_LABEL,
      }) as HTMLInputElement;
      expect(acceptance.required).toBe(true);
      expect(
        screen.getAllByRole('link', { name: legal.termsLink })[0],
      ).toHaveProperty('pathname', '/legal/terms');

      fireEvent.change(screen.getByLabelText(de.login.email), {
        target: { value: 'couple@example.invalid' },
      });
      fireEvent.click(acceptance);
      const submit = screen
        .getAllByRole('button', { name: de.identity.startTogetherSubmit })
        .find((button) => button.getAttribute('type') === 'submit');
      if (submit) fireEvent.click(submit);

      await waitFor(() => {
        expect(requestSpy).toHaveBeenCalledWith(
          apiBaseUrl,
          'couple@example.invalid',
          null,
          BUNDLED_TERMS_VERSION,
        );
      });
    });

    it('informs about the privacy policy without asking for consent', async () => {
      vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
        cloudWithTerms,
      );
      render(
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={null}
          onEntryTokenCleared={vi.fn()}
          onSession={vi.fn()}
        />,
      );

      fireEvent.click(
        await screen.findByRole('button', { name: de.identity.startTogether }),
      );

      // The terms remain the only required choice; the notice is not part of it.
      const [acceptance, ...others] = screen.getAllByRole('checkbox');
      expect(others).toEqual([]);
      expect(acceptance).toHaveProperty(
        'labels.0.textContent',
        ACCEPTANCE_LABEL,
      );
      const notice = screen.getByText((_, element) =>
        Boolean(
          element?.classList.contains('privacy-notice') &&
            element.textContent === PRIVACY_NOTICE,
        ),
      );
      expect(notice.closest('label')).toBeNull();
      expect(
        within(notice).getByRole('link', { name: PRIVACY_NOTICE_LINK }),
      ).toHaveProperty('pathname', '/legal/privacy');

      const footer = screen.getByRole('navigation', { name: legal.eyebrow });
      expect(
        within(footer)
          .getAllByRole('link')
          .map((link) => [
            link.textContent,
            (link as HTMLAnchorElement).pathname,
          ]),
      ).toEqual([
        [legal.termsLink, '/legal/terms'],
        [legal.privacyLink, '/legal/privacy'],
      ]);
    });

    it('sends the acceptance with a Cloud invitation request', async () => {
      vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
        cloudWithTerms,
      );
      const signupSpy = vi
        .spyOn(identityFlow, 'requestSignup')
        .mockResolvedValue();
      render(
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={{ kind: 'invitation', token: 'partner-invitation-token' }}
          onEntryTokenCleared={vi.fn()}
          onSession={vi.fn()}
        />,
      );

      fireEvent.click(
        await screen.findByRole('checkbox', {
          name: ACCEPTANCE_LABEL,
        }),
      );
      fireEvent.change(screen.getByLabelText(de.login.email), {
        target: { value: 'partner@example.invalid' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: de.identity.magicLinkRequestSubmit,
        }),
      );

      await screen.findByText(de.identity.mailRequestedTitle);
      expect(signupSpy).toHaveBeenCalledWith(
        apiBaseUrl,
        'partner@example.invalid',
        'partner-invitation-token',
        BUNDLED_TERMS_VERSION,
      );
    });

    it('asks for the acceptance when an opened link would create an account', async () => {
      vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue(
        cloudWithTerms,
      );
      const onSession = vi.fn();
      const consumeSpy = vi
        .spyOn(identityFlow, 'consumeSignup')
        .mockRejectedValueOnce(
          new ClientProblemError('conflict', 409, 'TERMS_ACCEPTANCE_REQUIRED'),
        )
        .mockResolvedValueOnce({
          account: { id: 'acc-1', displayName: 'Lea' },
          tokens: {
            accessToken: 'tok-access',
            refreshToken: 'tok-refresh',
            accessExpiresAt: new Date(Date.now() + 3600_000),
            refreshExpiresAt: new Date(Date.now() + 86400_000),
          },
          accountCreated: true,
        });
      render(
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={{ kind: 'signup', token: 'sign-in-form-proof' }}
          onEntryTokenCleared={vi.fn()}
          onSession={onSession}
        />,
      );

      await screen.findByRole('heading', { name: legal.pendingTitle });
      expect(screen.queryByText(de.identity.signupFailedTitle)).toBeNull();
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: ACCEPTANCE_LABEL,
        }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: legal.createAccount }),
      );

      await waitFor(() => {
        expect(consumeSpy).toHaveBeenLastCalledWith(
          apiBaseUrl,
          'sign-in-form-proof',
          undefined,
          BUNDLED_TERMS_VERSION,
        );
        expect(onSession).toHaveBeenCalledTimes(1);
      });
    });

    it('asks to reload instead of accepting a different text', async () => {
      vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
        ...cloudWithTerms,
        termsOfUseVersion: 'a-newer-version',
      });
      render(
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={null}
          onEntryTokenCleared={vi.fn()}
          onSession={vi.fn()}
        />,
      );

      fireEvent.click(
        await screen.findByRole('button', { name: de.identity.startTogether }),
      );

      expect(screen.getByText(legal.outdatedTitle)).toBeDefined();
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(
        screen
          .queryAllByRole('button', { name: de.identity.startTogetherSubmit })
          .filter((button) => button.getAttribute('type') === 'submit'),
      ).toEqual([]);
    });

    it('shows no Cloud terms on deployments without them', async () => {
      vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
        ...cloudWithTerms,
        accountCreation: 'invitation',
        selfServiceSignupAvailable: false,
        termsOfUseVersion: null,
      });
      render(
        <IdentityEntry
          apiBaseUrl={apiBaseUrl}
          entryToken={null}
          onEntryTokenCleared={vi.fn()}
          onSession={vi.fn()}
        />,
      );

      await screen.findByRole('heading', { name: de.identity.magicLinkTitle });
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.queryByRole('link', { name: legal.termsLink })).toBeNull();
      expect(
        screen.queryByRole('link', { name: legal.privacyLink }),
      ).toBeNull();
      expect(screen.queryByText(PRIVACY_NOTICE)).toBeNull();
    });
  });
});
