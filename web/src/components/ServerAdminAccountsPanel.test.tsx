// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminAccountDetail } from '../api/generated/models/ServerAdminAccountDetail';
import type { ServerAdminAccountSummary } from '../api/generated/models/ServerAdminAccountSummary';
import { ClientProblemError } from '../client/problemDetails';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminAccountsPanel } from './ServerAdminAccountsPanel';

const accountId = '00000000-0000-0000-0000-000000000101';
const emailId = '00000000-0000-0000-0000-000000000102';
const targetEmail = 'target@example.test';

const accountSummary: ServerAdminAccountSummary = {
  activeMembershipCount: 1,
  activeSessionCount: 1,
  authMethods: ['LOCAL_PASSWORD'],
  createdAt: new Date('2026-09-19T12:00:00Z'),
  disabledAt: null,
  displayName: 'Target Account',
  emailVerified: false,
  id: accountId,
  primaryEmail: targetEmail,
};

const accountDetail: ServerAdminAccountDetail = {
  ...accountSummary,
  emails: [
    {
      email: targetEmail,
      id: emailId,
      isPrimary: true,
      verifiedAt: null,
    },
  ],
  historicalMembershipCount: 1,
  lastSessionActivityAt: new Date('2026-09-19T17:00:00Z'),
  localPasswordAvailable: true,
  mailRecoveryAvailable: false,
  passkeyCount: 0,
};

function renderPanel({
  verifyEmail = vi.fn(),
  verificationRequest = vi.fn(),
  operatorRecovery = vi.fn(),
  deleteAccount = vi.fn(),
  summary = accountSummary,
  detail = accountDetail,
}: {
  verifyEmail?: ReturnType<typeof vi.fn>;
  verificationRequest?: ReturnType<typeof vi.fn>;
  operatorRecovery?: ReturnType<typeof vi.fn>;
  deleteAccount?: ReturnType<typeof vi.fn>;
  summary?: ServerAdminAccountSummary;
  detail?: ServerAdminAccountDetail;
} = {}) {
  const listAccounts = vi.fn().mockResolvedValue({
    items: [summary],
    limit: 25,
    offset: 0,
    total: 1,
  });
  const loadAccount = vi.fn().mockResolvedValue(detail);
  const api = {
    getServerAdminAccountApiV1ServerAdminAccountsAccountIdGet: loadAccount,
    issueServerAdminOperatorRecoveryApiV1ServerAdminAccountsAccountIdRecoveryOperatorPost:
      operatorRecovery,
    requestServerAdminAccountEmailVerificationApiV1ServerAdminAccountsAccountIdEmailVerificationRequestPost:
      verificationRequest,
    listServerAdminAccountsApiV1ServerAdminAccountsGet: listAccounts,
    verifyServerAdminAccountEmailApiV1ServerAdminAccountsAccountIdEmailsAccountEmailIdVerifyPost:
      verifyEmail,
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
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ServerAdminAccountsPanel api={api} onOverviewChanged={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return {
    listAccounts,
    loadAccount,
    verifyEmail,
    verificationRequest,
    operatorRecovery,
    deleteAccount,
  };
}

async function openAccountDetail() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: serverAdmin.accounts.open,
    }),
  );
  await screen.findByRole('heading', {
    name: accountDetail.displayName,
    level: 3,
  });
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('ServerAdminAccountsPanel privileged actions', () => {
  it('requests normal verification for the unverified primary email', async () => {
    const verificationRequest = vi.fn().mockResolvedValue(undefined);
    renderPanel({ verificationRequest });
    await openAccountDetail();

    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.detail.resendVerification,
      }),
    );

    await waitFor(() =>
      expect(verificationRequest).toHaveBeenCalledWith({ accountId }),
    );
    expect(
      await screen.findByText(
        serverAdmin.accounts.detail.verificationRequested,
      ),
    ).toBeTruthy();
  });

  it('shows an explicit mail-unavailable error for verification resend', async () => {
    const verificationRequest = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError('server', 503, 'MAIL_TRANSPORT_UNAVAILABLE'),
      );
    renderPanel({ verificationRequest });
    await openAccountDetail();

    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.detail.resendVerification,
      }),
    );

    expect(
      await screen.findByText(serverAdmin.accounts.detail.mailUnavailable),
    ).toBeTruthy();
  });

  it('verifies the email directly without a step-up dialog', async () => {
    const verifyEmail = vi.fn().mockResolvedValueOnce({
      ...accountDetail.emails[0],
      verifiedAt: new Date('2026-09-19T18:00:00Z'),
    });
    const rendered = renderPanel({ verifyEmail });
    await openAccountDetail();
    const reloadsBefore = rendered.loadAccount.mock.calls.length;

    const confirmation = screen.getByLabelText(
      serverAdmin.accounts.detail.typeEmailToVerify,
    );
    fireEvent.change(confirmation, { target: { value: targetEmail } });
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.detail.verifyEmail,
      }),
    );

    await waitFor(() => expect(verifyEmail).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(rendered.loadAccount.mock.calls.length).toBeGreaterThan(
        reloadsBefore,
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('issues operator recovery directly without a step-up dialog', async () => {
    const recoveryProof = {
      expiresAt: new Date('2026-09-19T18:10:00Z'),
      recoveryUrl: 'https://example.test/recovery/proof',
    };
    const operatorRecovery = vi.fn().mockResolvedValueOnce(recoveryProof);
    renderPanel({ operatorRecovery });
    await openAccountDetail();

    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.detail.operatorRecovery,
      }),
    );

    await screen.findByDisplayValue(recoveryProof.recoveryUrl);
    expect(operatorRecovery).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens deletion dialog when delete account button is clicked', async () => {
    renderPanel();
    await openAccountDetail();

    const deleteBtn = screen.getByRole('button', {
      name: serverAdmin.accounts.detail.deleteAccount,
    });
    fireEvent.click(deleteBtn);

    await screen.findByText(serverAdmin.accounts.deletionDialog.stage1Title);
  });

  it('displays pending deletion status in table and notice in detail view', async () => {
    const pendingSummary: ServerAdminAccountSummary = {
      ...accountSummary,
      deletionStatus: 'PENDING',
    };
    const pendingDetail: ServerAdminAccountDetail = {
      ...accountDetail,
      deletionStatus: 'PENDING',
      deletionAcceptedAt: new Date('2026-09-19T18:00:00Z'),
    };

    renderPanel({ summary: pendingSummary, detail: pendingDetail });

    // Status in table
    expect(
      await screen.findByText(serverAdmin.accounts.status.pendingDeletion),
    ).toBeTruthy();

    await openAccountDetail();

    // Notice in detail view
    expect(
      screen.getByText(serverAdmin.accounts.detail.deletionNotice),
    ).toBeTruthy();
    // Delete button should not be shown
    expect(
      screen.queryByRole('button', {
        name: serverAdmin.accounts.detail.deleteAccount,
      }),
    ).toBeNull();
  });
});
