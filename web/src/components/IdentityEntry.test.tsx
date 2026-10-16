// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityFlow from '../client/identityFlow';
import * as instanceStatus from '../client/instanceStatus';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import { IdentityEntry } from './IdentityEntry';

interface CustomMatchers<R = unknown> {
  toHaveFocus(): R;
}

declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: vitest matcher declaration
  interface Assertion<T = any> extends CustomMatchers<T> {}
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
      );
    });

    // Shows neutral mail notice and moves focus to status container
    await screen.findByText(de.identity.mailRequestedTitle);
    expect(screen.getByText(de.identity.mailRequestedBody)).toBeDefined();
    const statusBox = screen.getByRole('status');
    expect(statusBox).toHaveFocus();
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
});
