// @vitest-environment jsdom
//
// #2176: after a mail link was requested the person must be able to request
// another one or use another address in every mode, without restarting the app.
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
import de from '../i18n/locales/de';
import { IdentityEntry } from './IdentityEntry';

const apiBaseUrl = 'https://eimir.invalid';
const ADDRESS = 'admin@example.invalid';

function mockInstance(localPassword: boolean) {
  vi.spyOn(instanceStatus, 'loadInstanceAccessStatus').mockResolvedValue({
    availability: 'available',
    auth: { localPassword, magicLink: true, oidc: false, passkey: false },
    accountCreation: 'self_service',
    selfServiceSignupAvailable: true,
    maintenanceMode: false,
    registrationAvailable: true,
    termsOfUseVersion: null,
  });
}

function renderEntry() {
  return render(
    <IdentityEntry
      apiBaseUrl={apiBaseUrl}
      entryToken={null}
      onEntryTokenCleared={vi.fn()}
      onSession={vi.fn()}
    />,
  );
}

function typeAddress() {
  fireEvent.change(screen.getByLabelText(de.login.email), {
    target: { value: ADDRESS },
  });
}

async function requestCloudSignInLink() {
  renderEntry();
  await screen.findByRole('heading', { name: de.identity.magicLinkTitle });
  typeAddress();
  fireEvent.click(
    screen.getByRole('button', { name: de.identity.magicLinkRequestSubmit }),
  );
  await screen.findByText(de.identity.mailRequestedTitle);
}

const resendButton = () =>
  screen.getByRole('button', { name: de.identity.requestNewLink });
const otherAddressButton = () =>
  screen.getByRole('button', { name: de.identity.useOtherAddress });

describe('mail-requested state', () => {
  let requestSignup: ReturnType<typeof vi.spyOn>;
  let requestMagicLink: ReturnType<typeof vi.spyOn>;
  let requestRecovery: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    requestSignup = vi.spyOn(identityFlow, 'requestSignup').mockResolvedValue();
    requestMagicLink = vi
      .spyOn(identityFlow, 'requestMagicLink')
      .mockResolvedValue();
    requestRecovery = vi
      .spyOn(identityFlow, 'requestPasswordRecovery')
      .mockResolvedValue();
  });

  describe('Cloud sign-in (magic link only)', () => {
    it('keeps the neutral notice and offers both restart actions', async () => {
      mockInstance(false);
      await requestCloudSignInLink();

      expect(screen.getByText(de.identity.mailRequestedBody)).toBeDefined();
      expect(resendButton()).toBeDefined();
      expect(otherAddressButton()).toBeDefined();
      // "Zur Anmeldung" is only offered where a distinct sign-in mode exists.
      expect(
        screen.queryByRole('button', { name: de.identity.backToSignIn }),
      ).toBeNull();
    });

    it('resends to the same address without retyping', async () => {
      mockInstance(false);
      await requestCloudSignInLink();
      expect(requestSignup).toHaveBeenCalledTimes(1);

      fireEvent.click(resendButton());

      await waitFor(() => expect(requestSignup).toHaveBeenCalledTimes(2));
      expect(requestSignup).toHaveBeenLastCalledWith(apiBaseUrl, ADDRESS);
      expect(requestMagicLink).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByRole('status')).toBe(document.activeElement),
      );
      expect(resendButton()).toBeDefined();
    });

    it('shows an empty, focused form for another address', async () => {
      mockInstance(false);
      await requestCloudSignInLink();

      fireEvent.click(otherAddressButton());

      const field = (await screen.findByLabelText(
        de.login.email,
      )) as HTMLInputElement;
      expect(field.value).toBe('');
      await waitFor(() => expect(field).toBe(document.activeElement));
      expect(screen.queryByText(de.identity.mailRequestedTitle)).toBeNull();
    });

    it('lets the active Anmelden tab restart the form', async () => {
      mockInstance(false);
      await requestCloudSignInLink();

      fireEvent.click(screen.getByRole('button', { name: de.login.heading }));

      expect(await screen.findByLabelText(de.login.email)).toBeDefined();
      expect(screen.queryByText(de.identity.mailRequestedTitle)).toBeNull();
    });

    it('does not bring back a stale notice after a detour through Gemeinsam starten', async () => {
      mockInstance(false);
      await requestCloudSignInLink();

      fireEvent.click(
        screen.getByRole('button', { name: de.identity.startTogether }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: de.identity.alreadyRegistered,
        }),
      );

      expect(await screen.findByLabelText(de.login.email)).toBeDefined();
      expect(screen.queryByText(de.identity.mailRequestedTitle)).toBeNull();
    });

    it('disables both actions while a resend is pending and keeps the label width-stable', async () => {
      mockInstance(false);
      await requestCloudSignInLink();
      let finish: () => void = () => {};
      requestSignup.mockImplementation(
        () => new Promise<void>((resolve) => (finish = resolve)),
      );

      fireEvent.click(resendButton());

      const pending = await screen.findByRole('button', {
        name: de.identity.magicLinkRequestPending,
      });
      expect((pending as HTMLButtonElement).disabled).toBe(true);
      expect((otherAddressButton() as HTMLButtonElement).disabled).toBe(true);
      finish();
      await screen.findByRole('button', { name: de.identity.requestNewLink });
    });

    it('shows the request error and keeps the actions when a resend fails', async () => {
      mockInstance(false);
      await requestCloudSignInLink();
      requestSignup.mockRejectedValue(new Error('offline'));

      fireEvent.click(resendButton());

      await waitFor(() => expect(screen.getAllByRole('alert').length).toBe(1));
      expect(resendButton()).toBeDefined();
      expect(otherAddressButton()).toBeDefined();
    });
  });

  describe('Gemeinsam starten', () => {
    async function requestSignupLink() {
      mockInstance(false);
      renderEntry();
      fireEvent.click(
        await screen.findByRole('button', { name: de.identity.startTogether }),
      );
      typeAddress();
      const submit = screen
        .getAllByRole('button', { name: de.identity.startTogetherSubmit })
        .find((button) => button.getAttribute('type') === 'submit');
      if (submit) fireEvent.click(submit);
      await screen.findByText(de.identity.mailRequestedTitle);
    }

    it('resends with the same address and keeps the existing way back', async () => {
      await requestSignupLink();
      expect(
        screen.getByRole('button', { name: de.identity.alreadyRegistered }),
      ).toBeDefined();

      fireEvent.click(resendButton());

      await waitFor(() => expect(requestSignup).toHaveBeenCalledTimes(2));
      expect(requestSignup).toHaveBeenLastCalledWith(
        apiBaseUrl,
        ADDRESS,
        null,
        null,
      );
    });

    it('offers another address', async () => {
      await requestSignupLink();

      fireEvent.click(otherAddressButton());

      const field = (await screen.findByLabelText(
        de.login.email,
      )) as HTMLInputElement;
      expect(field.value).toBe('');
      expect(screen.queryByText(de.identity.mailRequestedTitle)).toBeNull();
    });
  });

  describe('password recovery (local password instance)', () => {
    async function requestRecoveryLink() {
      mockInstance(true);
      renderEntry();
      fireEvent.click(
        await screen.findByRole('button', { name: de.identity.forgotPassword }),
      );
      typeAddress();
      fireEvent.click(
        screen.getByRole('button', {
          name: de.identity.recoveryRequestSubmit,
        }),
      );
      await screen.findByText(de.identity.mailRequestedTitle);
    }

    it('resends, offers another address, and keeps Zur Anmeldung', async () => {
      await requestRecoveryLink();
      const card = within(
        screen.getByRole('status').parentElement as HTMLElement,
      );
      expect(
        card.getByRole('button', { name: de.identity.backToSignIn }),
      ).toBeDefined();

      fireEvent.click(resendButton());
      await waitFor(() => expect(requestRecovery).toHaveBeenCalledTimes(2));
      expect(requestRecovery).toHaveBeenLastCalledWith(apiBaseUrl, ADDRESS);

      fireEvent.click(otherAddressButton());
      expect(await screen.findByLabelText(de.login.email)).toBeDefined();
      expect(screen.queryByText(de.identity.mailRequestedTitle)).toBeNull();
    });
  });
});
