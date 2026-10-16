// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientProblemError } from '../client/problemDetails';
import * as recentAuthentication from '../client/recentAuthentication';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminRecentAuthModal } from './ServerAdminRecentAuthModal';

function renderModal({
  onSuccess = vi.fn(),
  onCancel = vi.fn(),
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ServerAdminRecentAuthModal
        apiBaseUrl="https://api.example.test"
        accessToken="server-admin-token"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </QueryClientProvider>,
  );
  return { onSuccess, onCancel };
}

function recentResult(method: string) {
  return {
    purpose: 'SERVER_ADMIN_ACTION',
    method,
    achievedAt: new Date('2026-09-19T18:00:00Z'),
    expiresAt: new Date('2026-09-19T18:05:00Z'),
  };
}

beforeEach(() => {
  vi.spyOn(
    recentAuthentication,
    'loadServerAdminRecentAuthenticationCapabilities',
  ).mockResolvedValue({
    expiresInSeconds: 300,
    localPassword: true,
    passkey: true,
    oidcConnections: ['company-oidc'],
  });
  vi.spyOn(
    recentAuthentication,
    'authenticateServerAdminRecentPassword',
  ).mockResolvedValue(recentResult('LOCAL_PASSWORD'));
  vi.spyOn(
    recentAuthentication,
    'authenticateServerAdminRecentPasskey',
  ).mockResolvedValue(recentResult('PASSKEY'));
  vi.spyOn(
    recentAuthentication,
    'authenticateServerAdminRecentOidc',
  ).mockResolvedValue(recentResult('OIDC'));
});

afterEach(() => vi.restoreAllMocks());

describe('ServerAdminRecentAuthModal', () => {
  it('shows a loading state while capabilities are unresolved', () => {
    vi.mocked(
      recentAuthentication.loadServerAdminRecentAuthenticationCapabilities,
    ).mockImplementation(() => new Promise(() => undefined));

    renderModal();

    expect(screen.getByRole('status').textContent).toContain(
      serverAdmin.stepUp.loading,
    );
  });

  it('renders only methods reported by server capabilities', async () => {
    vi.mocked(
      recentAuthentication.loadServerAdminRecentAuthenticationCapabilities,
    ).mockResolvedValue({
      expiresInSeconds: 300,
      localPassword: false,
      passkey: true,
      oidcConnections: [],
    });

    renderModal();

    await screen.findByRole('button', {
      name: serverAdmin.stepUp.passkeyAction,
    });
    expect(
      screen.queryByLabelText(serverAdmin.stepUp.passwordLabel),
    ).toBeNull();
    expect(screen.queryByText(/company-oidc/)).toBeNull();
  });

  it('completes password step-up and reports success', async () => {
    const { onSuccess } = renderModal();

    const password = await screen.findByLabelText(
      serverAdmin.stepUp.passwordLabel,
    );
    fireEvent.change(password, { target: { value: 'current-password' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.stepUp.passwordAction,
      }),
    );

    await waitFor(() => {
      expect(
        recentAuthentication.authenticateServerAdminRecentPassword,
      ).toHaveBeenCalledWith(
        'https://api.example.test',
        'server-admin-token',
        'current-password',
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('offers passkey and OIDC through the shared recent-auth client', async () => {
    renderModal();

    fireEvent.click(
      await screen.findByRole('button', {
        name: serverAdmin.stepUp.passkeyAction,
      }),
    );
    await waitFor(() =>
      expect(
        recentAuthentication.authenticateServerAdminRecentPasskey,
      ).toHaveBeenCalledTimes(1),
    );

    const oidc = await screen.findByRole('button', {
      name: serverAdmin.stepUp.oidcAction + ' · company-oidc',
    });
    fireEvent.click(oidc);
    await waitFor(() =>
      expect(
        recentAuthentication.authenticateServerAdminRecentOidc,
      ).toHaveBeenCalledWith(
        'https://api.example.test',
        'server-admin-token',
        'company-oidc',
      ),
    );
  });

  it('renders rate-limit failures through the shared problem state', async () => {
    vi.mocked(
      recentAuthentication.authenticateServerAdminRecentPassword,
    ).mockRejectedValue(
      new ClientProblemError('rateLimit', 429, 'RATE_LIMIT_EXCEEDED', 30),
    );
    renderModal();

    const password = await screen.findByLabelText(
      serverAdmin.stepUp.passwordLabel,
    );
    fireEvent.change(password, { target: { value: 'current-password' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.stepUp.passwordAction,
      }),
    );

    await waitFor(() =>
      expect(document.querySelector('.ui-state-rateLimit')).not.toBeNull(),
    );
  });

  it('contains Tab navigation within the modal', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog');
    const cancel = screen.getByRole('button', {
      name: serverAdmin.stepUp.cancel,
    });
    const oidc = await screen.findByRole('button', {
      name: serverAdmin.stepUp.oidcAction + ' · company-oidc',
    });

    oidc.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(oidc);
  });

  it('supports Escape cancellation while idle', async () => {
    const { onCancel } = renderModal();
    const dialog = await screen.findByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
