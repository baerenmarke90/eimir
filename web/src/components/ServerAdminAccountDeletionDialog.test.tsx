// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminAccountDetail } from '../api/generated/models/ServerAdminAccountDetail';
import { ClientProblemError } from '../client/problemDetails';
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
  onClose = vi.fn<() => void>(),
  onSuccess = vi.fn<() => void>(),
  account = accountDetail,
}: {
  deleteAccount?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn<() => void>>;
  onSuccess?: ReturnType<typeof vi.fn<() => void>>;
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
        account={account}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );

  return { api, deleteAccount, onClose, onSuccess };
}

describe('ServerAdminAccountDeletionDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders step 1 (consequences) and advances to the confirmation on acknowledge', async () => {
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
        name: serverAdmin.accounts.deletionDialog.proceedToConfirm,
      }),
    );

    // Goes straight to the typed confirmation; no step-up dialog.
    await screen.findByText(serverAdmin.accounts.deletionDialog.stage3Title);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('progresses from consequences to the typed confirmation and completes deletion', async () => {
    const deleteAccount = vi.fn().mockResolvedValue({
      accountId,
      deletionStatus: 'PENDING',
      scheduledAt: new Date('2026-09-19T18:00:00Z'),
      jobQueued: true,
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    renderDialog({ deleteAccount, onSuccess, onClose });

    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToConfirm,
      }),
    );

    // The typed confirmation follows directly
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

    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToConfirm,
      }),
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

    // Advance to the typed confirmation
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToConfirm,
      }),
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

    // Advance to the typed confirmation
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.deletionDialog.proceedToConfirm,
      }),
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
