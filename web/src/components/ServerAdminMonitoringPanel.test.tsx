// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminMonitoring } from '../api/generated/models/ServerAdminMonitoring';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminMonitoringPanel } from './ServerAdminMonitoringPanel';

const monitoring = serverAdmin.monitoring;

function data(
  overrides: Partial<ServerAdminMonitoring> = {},
): ServerAdminMonitoring {
  return {
    range: '24h',
    points: [],
    storage: { usedBytes: 0, totalBytes: null, fullInDays: null },
    services: [
      {
        key: 'worker',
        status: 'silent',
        lastSeenAt: new Date('2026-11-26T09:00:00Z'),
      },
      { key: 'video_worker', status: 'no_heartbeat_signal', lastSeenAt: null },
      { key: 'email', status: 'ok', lastSeenAt: null },
      { key: 'push', status: 'problem', lastSeenAt: null },
    ],
    alertsEnabled: true,
    pushEnabled: true,
    ...overrides,
  } as ServerAdminMonitoring;
}

function point(at: string, extra: Record<string, unknown> = {}) {
  return {
    at: new Date(at),
    requests: 100,
    serverErrors: 1,
    p95Ms: 250,
    newAccounts: 1,
    activeSpaces: 2,
    storedBytes: 1_000,
    diskUsedBytes: 60,
    diskTotalBytes: 100,
    failedJobs: 0,
    failedEmails: 0,
    failedPushes: 0,
    ...extra,
  };
}

function renderPanel(get = vi.fn(), put = vi.fn(), putPush = vi.fn()) {
  const api = {
    getServerAdminMonitoringApiV1ServerAdminMonitoringGet: get,
    updateMonitoringAlertsSettingApiV1ServerAdminSettingsMonitoringAlertsPut:
      put,
    updateMonitoringPushSettingApiV1ServerAdminSettingsMonitoringPushPut:
      putPush,
  } as unknown as ServerAdminApi;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ServerAdminMonitoringPanel api={api} />
    </QueryClientProvider>,
  );
  return { get, put };
}

describe('ServerAdminMonitoringPanel', () => {
  afterEach(() => cleanup());

  it('says the history is just starting when there are no points', async () => {
    renderPanel(vi.fn().mockResolvedValue(data()));
    expect(await screen.findByText(monitoring.emptyHistory)).toBeTruthy();
  });

  it('asks for the chosen range', async () => {
    const { get } = renderPanel(vi.fn().mockResolvedValue(data()));
    await screen.findByText(monitoring.emptyHistory);
    fireEvent.click(
      screen.getByRole('button', { name: monitoring.ranges['30d'] }),
    );
    await waitFor(() => expect(get).toHaveBeenLastCalledWith({ range: '30d' }));
  });

  it('shows a storage total only when the server knows it', async () => {
    renderPanel(
      vi.fn().mockResolvedValue(
        data({
          points: [
            point('2026-11-26T08:00:00Z'),
            point('2026-11-26T09:00:00Z'),
          ],
          storage: { usedBytes: 60, totalBytes: 100, fullInDays: 40 },
        }),
      ),
    );
    expect(
      await screen.findByText(
        monitoring.fullIn_other.replace('{{count, number}}', '40'),
      ),
    ).toBeTruthy();
  });

  it('names a silent worker as silent', async () => {
    renderPanel(vi.fn().mockResolvedValue(data()));
    const worker = (
      await screen.findByText(monitoring.services.worker)
    ).closest('li');
    expect(worker?.textContent).toContain(monitoring.status.silent);
  });

  it('moves the switch at once and back with a message when saving fails', async () => {
    const put = vi.fn().mockRejectedValue(new Error('offline'));
    renderPanel(vi.fn().mockResolvedValue(data()), put);
    const toggle = (await screen.findByRole('checkbox', {
      name: monitoring.alertsLabel,
    })) as HTMLInputElement;
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(await screen.findByText(monitoring.alertsSaveFailed)).toBeTruthy();
    expect(toggle.checked).toBe(true);
  });

  it('turns alert mails off through the settings route', async () => {
    const put = vi.fn().mockResolvedValue({});
    renderPanel(vi.fn().mockResolvedValue(data()), put);
    const toggle = await screen.findByRole('checkbox', {
      name: monitoring.alertsLabel,
    });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith({
        serverAdminSettingUpdate: { enabled: false },
      }),
    );
  });

  it('turns alert push off through its own route, leaving mails on', async () => {
    const put = vi.fn().mockResolvedValue({});
    const putPush = vi.fn().mockResolvedValue({});
    renderPanel(vi.fn().mockResolvedValue(data()), put, putPush);
    const mails = (await screen.findByRole('checkbox', {
      name: monitoring.alertsLabel,
    })) as HTMLInputElement;
    const push = (await screen.findByRole('checkbox', {
      name: monitoring.pushLabel,
    })) as HTMLInputElement;
    expect(push.checked).toBe(true);
    fireEvent.click(push);
    expect(push.checked).toBe(false);
    await waitFor(() =>
      expect(putPush).toHaveBeenCalledExactlyOnceWith({
        serverAdminSettingUpdate: { enabled: false },
      }),
    );
    expect(put).not.toHaveBeenCalled();
    expect(mails.checked).toBe(true);
  });

  it('puts the push switch back with a message when saving fails', async () => {
    const putPush = vi.fn().mockRejectedValue(new Error('offline'));
    renderPanel(vi.fn().mockResolvedValue(data()), vi.fn(), putPush);
    const push = (await screen.findByRole('checkbox', {
      name: monitoring.pushLabel,
    })) as HTMLInputElement;
    fireEvent.click(push);
    expect(await screen.findByText(monitoring.pushSaveFailed)).toBeTruthy();
    expect(push.checked).toBe(true);
  });
});
