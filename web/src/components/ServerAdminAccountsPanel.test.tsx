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

vi.mock('./ServerAdminRecentAuthModal', () => ({
  ServerAdminRecentAuthModal: ({
    onSuccess,
    onCancel,
  }: {
    onSuccess: () => void;
    onCancel: () => void;
  }) => (
    <div role="dialog" aria-label="ServerAdmin step-up">
      <button type="button" onClick={onSuccess}>
        Complete step-up
      </button>
      <button type="button" onClick={onCancel}>
        Cancel step-up
      </button>
    </div>
  ),
}));

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

function stepUpRequired() {
  return new ClientProblemError(
    'permission',
    403,
    'RECENT_AUTHENTICATION_REQUIRED',
  );
}

function renderPanel({
  verifyEmail = vi.fn(),
  operatorRecovery = vi.fn(),
  deleteAccount = vi.fn(),
  summary = accountSummary,
  detail = accountDetail,
}: {
  verifyEmail?: ReturnType<typeof vi.fn>;
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
        <ServerAdminAccountsPanel
          api={api}
          apiBaseUrl="https://api.example.test"
          accessToken="admin-token"
          onOverviewChanged={vi.fn()}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return {
    listAccounts,
    loadAccount,
    verifyEmail,
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

describe('ServerAdminAccountsPanel recent-auth integration', () => {
  it('retries the exact email verification after successful step-up', async () => {
    const verifyEmail = vi
      .fn()
      .mockRejectedValueOnce(stepUpRequired())
      .mockResolvedValueOnce({
        ...accountDetail.emails[0],
        verifiedAt: new Date('2026-09-19T18:00:00Z'),
      });
    const rendered = renderPanel({ verifyEmail });
    await openAccountDetail();

    const confirmation = screen.getByLabelText(
      serverAdmin.accounts.detail.typeEmailToVerify,
    );
    fireEvent.change(confirmation, { target: { value: targetEmail } });
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.detail.verifyEmail,
      }),
    );

    await screen.findByRole('dialog', { name: 'ServerAdmin step-up' });
    expect(verifyEmail).toHaveBeenCalledTimes(1);

    const reloadsBeforeRetry = rendered.loadAccount.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Complete step-up' }));

    await waitFor(() => expect(verifyEmail).toHaveBeenCalledTimes(2));
    expect(verifyEmail.mock.calls[1]?.[0]).toEqual(
      verifyEmail.mock.calls[0]?.[0],
    );
    await waitFor(() =>
      expect(rendered.loadAccount.mock.calls.length).toBeGreaterThan(
        reloadsBeforeRetry,
      ),
    );
  });

  it('retries operator recovery after successful step-up', async () => {
    const recoveryProof = {
      expiresAt: new Date('2026-09-19T18:10:00Z'),
      recoveryUrl: 'https://example.test/recovery/proof',
    };
    const operatorRecovery = vi
      .fn()
      .mockRejectedValueOnce(stepUpRequired())
      .mockResolvedValueOnce(recoveryProof);
    renderPanel({ operatorRecovery });
    await openAccountDetail();

    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.accounts.detail.operatorRecovery,
      }),
    );

    await screen.findByRole('dialog', { name: 'ServerAdmin step-up' });
    expect(operatorRecovery).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Complete step-up' }));

    await waitFor(() => expect(operatorRecovery).toHaveBeenCalledTimes(2));
    expect(operatorRecovery.mock.calls[1]?.[0]).toEqual(
      operatorRecovery.mock.calls[0]?.[0],
    );
    await screen.findByDisplayValue(recoveryProof.recoveryUrl);
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
