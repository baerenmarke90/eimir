// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminAccountDetail } from '../api/generated/models/ServerAdminAccountDetail';
import { ClientProblemError } from '../client/problemDetails';
import * as recentAuthentication from '../client/recentAuthentication';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminAccountDeletionDialog } from './ServerAdminAccountDeletionDialog';

const accountId = '00000000-0000-0000-0000-000000000101';
const emailId = '00000000-0000-0000-0000-000000000102';
const targetEmail = 'target@example.test';

const accountDetail: ServerAdminAccountDetail = {
  activeMembershipCount: 1,
  activeSessionCount: 1,
  authMethods: ['LOCAL_PASSWORD'],
  createdAt: new Date('2026-09-19T12:00:00Z'),
  disabledAt: null,
  displayName: 'Target Account',
  emailVerified: true,
  id: accountId,
  primaryEmail: targetEmail,
  emails: [
    {
      email: targetEmail,
      id: emailId,
      isPrimary: true,
      verifiedAt: new Date('2026-09-19T12:00:00Z'),
    },
  ],
  historicalMembershipCount: 1,
  lastSessionActivityAt: new Date('2026-09-19T17:00:00Z'),
  localPasswordAvailable: true,
  mailRecoveryAvailable: false,
  passkeyCount: 0,
};

function renderDialog({
  deleteAccount = vi.fn(),
  onClose = vi.fn(),
  onSuccess = vi.fn(),
  account = accountDetail,
}: {
  deleteAccount?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn>;
  onSuccess?: ReturnType<typeof vi.fn>;
  account?: ServerAdminAccountDetail;
} = {}) {
  const api = {
    deleteServerAdminAccountApiV1ServerAdminAccountsAccountIdDeletionPost:
      deleteAccount,
  } as unknown as ServerAdminApi;

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ServerAdminAccountDeletionDialog
        api={api}
        apiBaseUrl="https://api.example.test"
        accessToken="admin-token"
        account={account}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );

  return { api, deleteAccount, onClose, onSuccess };
}

describe('ServerAdminAccountDeletionDialog', () => {
  beforeEach(() => {
    vi.spyOn(
      recentAuthentication,
      'loadServerAdminRecentAuthenticationCapabilities',
    ).mockResolvedValue({
      expiresInSeconds: 300,
      localPassword: true,
      passkey: false,
      oidcConnections: [],
    });
    vi.spyOn(
      recentAuthentication,
      'authenticateServerAdminRecentPassword',
    ).mockResolvedValue({
      purpose: 'SERVER_ADMIN_ACTION',
      method: 'LOCAL_PASSWORD',
      achievedAt: new Date('2026-09-19T18:00:00Z'),
      expiresAt: new Date('2026-09-19T18:05:00Z'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders step 1 (consequences) and advances to step 2 (auth) on acknowledge', async () => {
    renderDialog();

    expect(
      screen.getByText(serverAdmin.accounts.deletionDialog.stage1Title),
    ).toBeTruthy();
    expect(
      screen.getByText(serverAdmin.accounts.deletionDialog.consequenceAccess),
    ).toBeTruthy();
    expect(
      screen.getByText(serverAdmin.accounts.deletionDialog.consequenceSessions),
    ).toBeTruthy();
    expect(
      screen.getByText(
        serverAdmin.accounts.deletionDialog.consequenceOwnerData,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        serverAdmin.accounts.deletionDialog.consequenceSharedHistory,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(serverAdmin.accounts.deletionDialog.consequenceAsync),
    ).toBeTruthy();

    // Click acknowledge button
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToAuth,
      }),
    );

    // Should now be on step 2 (Recent Auth Modal)
    await screen.findByRole('dialog', {
      name: serverAdmin.stepUp.title,
    });
  });

  it('progresses through step 1, step 2, and completes deletion on step 3 with email confirmation', async () => {
    const deleteAccount = vi.fn().mockResolvedValue({
      accountId,
      deletionStatus: 'PENDING',
      scheduledAt: new Date('2026-09-19T18:00:00Z'),
      jobQueued: true,
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    renderDialog({ deleteAccount, onSuccess, onClose });

    // Step 1 -> Step 2
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToAuth,
      }),
    );
    await screen.findByRole('dialog', {
      name: serverAdmin.stepUp.title,
    });

    // Enter password in Step-up modal and submit
    const passwordInput = await screen.findByLabelText(
      serverAdmin.stepUp.passwordLabel,
    );
    fireEvent.change(passwordInput, { target: { value: 'correct-password' } });
    fireEvent.click(
      screen.getByRole('button', { name: serverAdmin.stepUp.passwordAction }),
    );

    // Should advance to Step 3 (Confirm)
    await screen.findByText(serverAdmin.accounts.deletionDialog.stage3Title);

    const deleteBtn = screen.getByRole('button', {
      name: serverAdmin.accounts.deletionDialog.stage3Submit,
    });
    expect(deleteBtn.hasAttribute('disabled')).toBe(true);

    // Type confirmation text: DELETE target@example.test
    const confirmInput = screen.getByPlaceholderText(
      serverAdmin.accounts.deletionDialog.stage3Placeholder,
    );
    fireEvent.change(confirmInput, {
      target: { value: `DELETE ${targetEmail}` },
    });

    expect(deleteBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledWith({
        accountId,
        serverAdminAccountDeletionRequest: {
          confirmation: `DELETE ${targetEmail}`,
        },
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('calls onClose when cancel is clicked in stage 1', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    fireEvent.click(
      screen.getAllByRole('button', {
        name: serverAdmin.accounts.deletionDialog.cancel,
      })[0],
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('allows confirmation with DELETE <accountId>', async () => {
    const deleteAccount = vi.fn().mockResolvedValue({
      accountId,
      deletionStatus: 'PENDING',
      scheduledAt: new Date('2026-09-19T18:00:00Z'),
      jobQueued: true,
    });

    renderDialog({ deleteAccount });

    // Step 1 -> Step 2
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToAuth,
      }),
    );
    await screen.findByRole('dialog', {
      name: serverAdmin.stepUp.title,
    });

    const passwordInput = await screen.findByLabelText(
      serverAdmin.stepUp.passwordLabel,
    );
    fireEvent.change(passwordInput, { target: { value: 'pw' } });
    fireEvent.click(
      screen.getByRole('button', { name: serverAdmin.stepUp.passwordAction }),
    );

    await screen.findByText(serverAdmin.accounts.deletionDialog.stage3Title);

    const deleteBtn = screen.getByRole('button', {
      name: serverAdmin.accounts.deletionDialog.stage3Submit,
    });

    // Type confirmation with ID
    const confirmInput = screen.getByPlaceholderText(
      serverAdmin.accounts.deletionDialog.stage3Placeholder,
    );
    fireEvent.change(confirmInput, {
      target: { value: `DELETE ${accountId}` },
    });

    expect(deleteBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalled();
    });
  });

  it('displays error message when self-lockout occurs', async () => {
    const deleteAccount = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError(
          'conflict',
          403,
          'SERVER_ADMIN_SELF_LOCKOUT_BLOCKED',
        ),
      );

    renderDialog({ deleteAccount });

    // Advance to step 3
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToAuth,
      }),
    );
    await screen.findByRole('dialog', {
      name: serverAdmin.stepUp.title,
    });
    const passwordInput = await screen.findByLabelText(
      serverAdmin.stepUp.passwordLabel,
    );
    fireEvent.change(passwordInput, { target: { value: 'pw' } });
    fireEvent.click(
      screen.getByRole('button', { name: serverAdmin.stepUp.passwordAction }),
    );

    await screen.findByText(serverAdmin.accounts.deletionDialog.stage3Title);
    const confirmInput = screen.getByPlaceholderText(
      serverAdmin.accounts.deletionDialog.stage3Placeholder,
    );
    fireEvent.change(confirmInput, {
      target: { value: `DELETE ${targetEmail}` },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.stage3Submit,
      }),
    );

    await screen.findByText(serverAdmin.accounts.deletionDialog.lockoutSelf);
  });

  it('displays error message when last-admin lockout occurs', async () => {
    const deleteAccount = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError(
          'conflict',
          403,
          'SERVER_ADMIN_LAST_ADMIN_LOCKOUT_BLOCKED',
        ),
      );

    renderDialog({ deleteAccount });

    // Advance to step 3
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToAuth,
      }),
    );
    await screen.findByRole('dialog', {
      name: serverAdmin.stepUp.title,
    });
    const passwordInput2 = await screen.findByLabelText(
      serverAdmin.stepUp.passwordLabel,
    );
    fireEvent.change(passwordInput2, { target: { value: 'pw' } });
    fireEvent.click(
      screen.getByRole('button', { name: serverAdmin.stepUp.passwordAction }),
    );

    await screen.findByText(serverAdmin.accounts.deletionDialog.stage3Title);
    const confirmInput2 = screen.getByPlaceholderText(
      serverAdmin.accounts.deletionDialog.stage3Placeholder,
    );
    fireEvent.change(confirmInput2, {
      target: { value: `DELETE ${targetEmail}` },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.stage3Submit,
      }),
    );

    await screen.findByText(
      serverAdmin.accounts.deletionDialog.lockoutLastAdmin,
    );
  });
});
