// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountApi } from '../api/generated/apis/AccountApi';
import { AccountDeletionStatus } from '../api/generated/models/AccountDeletionStatus';
import * as recentAuthentication from '../client/recentAuthentication';
import accountSettings from '../i18n/locales/accountSettings';
import { AccountSettingsPanel } from './AccountSettingsPanel';
import germanUi from '../i18n/locales/de';

function renderPanel(demoMode = false, onDeletionAccepted = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AccountSettingsPanel
        apiBaseUrl="http://api.example.test"
        accessToken="session-token"
        demoMode={demoMode}
        onDeletionAccepted={onDeletionAccepted}
      />
    </QueryClientProvider>,
  );
  return onDeletionAccepted;
}

function openConsequences() {
  fireEvent.click(
    screen.getByRole('button', { name: accountSettings.deleteAction }),
  );
  expect(screen.getByText(accountSettings.consequencesTitle)).toBeDefined();
}

async function completePasswordStepUp() {
  fireEvent.click(
    screen.getByRole('button', { name: germanUi.common.continue }),
  );
  await screen.findByLabelText(accountSettings.reauthPasswordLabel);
  fireEvent.change(screen.getByLabelText(accountSettings.reauthPasswordLabel), {
    target: { value: 'test-passphrase' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: accountSettings.reauthPasswordAction }),
  );
  await screen.findByText(accountSettings.finalTitle);
}

beforeEach(() => {
  vi.spyOn(
    recentAuthentication,
    'loadRecentAuthenticationCapabilities',
  ).mockResolvedValue({
    expiresInSeconds: 300,
    localPassword: true,
    oidcConnections: [],
    passkey: false,
  });
  vi.spyOn(
    recentAuthentication,
    'authenticateRecentPassword',
  ).mockResolvedValue({
    purpose: 'ACCOUNT_DELETION',
    method: 'LOCAL_PASSWORD',
    achievedAt: new Date('2026-09-06T12:00:00Z'),
    expiresAt: new Date('2026-09-06T12:05:00Z'),
  });
});

afterEach(() => vi.restoreAllMocks());

describe('AccountSettingsPanel', () => {
  it('keeps self-service deletion unavailable for Demo Accounts', () => {
    const deleteSpy = vi.spyOn(
      AccountApi.prototype,
      'deleteOwnAccountApiV1AccountDeletionPost',
    );
    renderPanel(true);
    const button = screen.getByRole('button', {
      name: accountSettings.deleteAction,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('requires recent authentication before final typed confirmation', async () => {
    const deleteSpy = vi
      .spyOn(AccountApi.prototype, 'deleteOwnAccountApiV1AccountDeletionPost')
      .mockResolvedValue({
        acceptedAt: new Date('2026-09-05T00:00:00Z'),
        status: AccountDeletionStatus.PENDING,
      });
    const accepted = renderPanel(false);

    openConsequences();
    fireEvent.click(
      screen.getByRole('button', { name: germanUi.common.continue }),
    );
    await screen.findByLabelText(accountSettings.reauthPasswordLabel);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(accountSettings.finalTitle)).toBeNull();

    fireEvent.change(
      screen.getByLabelText(accountSettings.reauthPasswordLabel),
      {
        target: { value: 'test-passphrase' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: accountSettings.reauthPasswordAction,
      }),
    );
    await screen.findByText(accountSettings.finalTitle);
    expect(recentAuthentication.authenticateRecentPassword).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(accountSettings.confirmLabel), {
      target: { value: accountSettings.confirmPhrase },
    });
    fireEvent.click(
      screen.getByRole('button', { name: accountSettings.submitAction }),
    );

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith({
        accountDeletionRequest: { confirmation: 'DELETE_ACCOUNT' },
      });
      expect(accepted).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the final deletion step unreachable when no step-up method exists', async () => {
    vi.mocked(
      recentAuthentication.loadRecentAuthenticationCapabilities,
    ).mockResolvedValue({
      expiresInSeconds: 300,
      localPassword: false,
      oidcConnections: [],
      passkey: false,
    });
    const deleteSpy = vi.spyOn(
      AccountApi.prototype,
      'deleteOwnAccountApiV1AccountDeletionPost',
    );
    renderPanel();

    openConsequences();
    fireEvent.click(
      screen.getByRole('button', { name: germanUi.common.continue }),
    );
    await screen.findByText(accountSettings.reauthUnavailableTitle);

    expect(screen.queryByText(accountSettings.finalTitle)).toBeNull();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('points to a copy on request instead of an export detour', () => {
    renderPanel();

    openConsequences();

    expect(screen.getByText(accountSettings.consequencesIntro)).toBeDefined();
    expect(
      Object.keys(accountSettings).filter((key) => /^export/i.test(key)),
    ).toEqual([]);
    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.textContent)
        .filter((text) => /export/i.test(text ?? '')),
    ).toEqual([]);
  });

  it('keeps the final step open when the irreversible request fails', async () => {
    vi.spyOn(
      AccountApi.prototype,
      'deleteOwnAccountApiV1AccountDeletionPost',
    ).mockRejectedValue({ status: 503 });
    const accepted = renderPanel(false);
    openConsequences();
    await completePasswordStepUp();

    fireEvent.change(screen.getByLabelText(accountSettings.confirmLabel), {
      target: { value: accountSettings.confirmPhrase },
    });
    fireEvent.click(
      screen.getByRole('button', { name: accountSettings.submitAction }),
    );

    await waitFor(() => {
      expect(accepted).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(document.querySelector('.ui-state')).not.toBeNull();
    });
  });
});
