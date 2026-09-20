// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import serverAdmin from '../i18n/locales/serverAdmin';
import {
  ServerAdminActivityPanel,
  ServerAdminSettingsPanel,
} from './ServerAdminPage';

function renderActivity(
  getActivity: ReturnType<typeof vi.fn>,
  initialCategory:
    | 'all'
    | 'settings'
    | 'accounts'
    | 'spaces'
    | 'destructive' = 'all',
) {
  const api = {
    getServerAdminPrivilegedActivityApiV1ServerAdminActivityPrivilegedGet:
      getActivity,
  } as unknown as ServerAdminApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ServerAdminActivityPanel api={api} initialCategory={initialCategory} />
    </QueryClientProvider>,
  );
}

function auditItem(index: number) {
  return {
    action: 'account_suspended',
    actorId: '00000000-0000-4000-8000-000000000099',
    category: 'accounts',
    createdAt: new Date(`2026-09-01T12:${String(index).padStart(2, '0')}:00Z`),
    effectCount: null,
    id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
    newValue: null,
    previousValue: null,
    targetAccountId: '00000000-0000-4000-8000-000000000101',
    targetSpaceId: null,
  };
}

describe('ServerAdmin controls', () => {
  it('shows stored and effective registration state separately', () => {
    const html = renderToStaticMarkup(
      <ServerAdminSettingsPanel
        settings={{
          effectiveRegistrationEnabled: false,
          maintenanceMode: true,
          registrationEnabled: true,
          version: 3,
        }}
        registrationPending={false}
        maintenancePending={false}
        mutationError={null}
        onRegistrationChange={() => undefined}
        onMaintenanceChange={() => undefined}
      />,
    );

    expect(html.match(/server-admin-setting-row/g)).toHaveLength(2);
    expect(html).toContain('server-admin-effective-state');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it('filters and paginates the unified privileged audit', async () => {
    const getActivity = vi
      .fn()
      .mockResolvedValueOnce({
        items: Array.from({ length: 25 }, (_, index) => auditItem(index)),
        limit: 25,
        offset: 0,
        total: 26,
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 25 }, (_, index) => auditItem(index)),
        limit: 25,
        offset: 0,
        total: 26,
      })
      .mockResolvedValueOnce({
        items: [auditItem(25)],
        limit: 25,
        offset: 25,
        total: 26,
      });

    renderActivity(getActivity);

    expect(
      await screen.findAllByText('00000000-0000-4000-8000-000000000099'),
    ).toHaveLength(25);
    expect(getActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'all', limit: 25, offset: 0 }),
    );

    fireEvent.change(screen.getByLabelText(serverAdmin.activity.category), {
      target: { value: 'accounts' },
    });
    await waitFor(() =>
      expect(getActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'accounts', offset: 0 }),
      ),
    );

    fireEvent.click(
      screen.getByRole('button', { name: serverAdmin.activity.next }),
    );
    await waitFor(() =>
      expect(getActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'accounts', offset: 25 }),
      ),
    );
  });

  it('keeps empty and error states distinct', async () => {
    const empty = vi.fn().mockResolvedValue({
      items: [],
      limit: 25,
      offset: 0,
      total: 0,
    });
    const first = renderActivity(empty);
    expect(await screen.findByText(serverAdmin.activity.empty)).toBeTruthy();
    first.unmount();

    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    renderActivity(failing);
    expect((await screen.findByRole('alert')).textContent).toContain(
      serverAdmin.activity.errorBody,
    );
  });
});
