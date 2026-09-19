// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminSettings } from '../api/generated/models/ServerAdminSettings';
import { ServerAdminPage } from './ServerAdminPage';

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  putRegistration: vi.fn(),
  putMaintenance: vi.fn(),
  getActivity: vi.fn(),
  getOverview: vi.fn(),
}));

vi.mock('../client/serverAdmin', () => ({
  createServerAdminApis: () => ({
    auth: {},
    serverAdmin: {
      getServerAdminSettingsApiV1ServerAdminSettingsGet: api.getSettings,
      updateRegistrationSettingApiV1ServerAdminSettingsRegistrationPut:
        api.putRegistration,
      updateMaintenanceSettingApiV1ServerAdminSettingsMaintenancePut:
        api.putMaintenance,
      getServerAdminActivityApiV1ServerAdminActivityGet: api.getActivity,
      getServerAdminOverviewApiV1ServerAdminOverviewGet: api.getOverview,
    },
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function settings(
  registrationEnabled: boolean,
  maintenanceMode: boolean,
  version: number,
): ServerAdminSettings {
  return {
    registrationEnabled,
    maintenanceMode,
    effectiveRegistrationEnabled: registrationEnabled && !maintenanceMode,
    version,
  };
}

function renderSettingsPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/server-admin?section=settings']}>
        <ServerAdminPage
          apiBaseUrl="http://api.test"
          accessToken="token"
          onLogout={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function toggle(helpId: string): HTMLElement {
  const button = document.querySelector<HTMLElement>(
    `button[aria-describedby="${helpId}"]`,
  );
  if (!button) throw new Error(`Missing toggle for ${helpId}`);
  return button;
}

beforeEach(() => {
  Object.values(api).forEach((mock) => {
    mock.mockReset();
  });
  api.getActivity.mockResolvedValue([]);
  api.getOverview.mockResolvedValue({});
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ServerAdmin settings convergence', () => {
  it('converges to the authoritative state when responses complete out of order', async () => {
    // Server serializes: registration off (v2) commits first, then
    // maintenance on (v3). The responses return in the opposite order.
    const initial = settings(true, false, 1);
    const afterRegistration = settings(false, false, 2);
    const final = settings(false, true, 3);
    const registrationResponse = deferred<ServerAdminSettings>();
    const maintenanceResponse = deferred<ServerAdminSettings>();
    let serverState = initial;
    api.getSettings.mockImplementation(async () => serverState);
    api.putRegistration.mockReturnValue(registrationResponse.promise);
    api.putMaintenance.mockReturnValue(maintenanceResponse.promise);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderSettingsPage(queryClient);
    await waitFor(() =>
      expect(
        toggle('server-registration-help').getAttribute('aria-pressed'),
      ).toBe('true'),
    );

    const user = userEvent.setup();
    await user.click(toggle('server-registration-help'));
    await user.click(toggle('server-maintenance-help'));
    expect(api.putRegistration).toHaveBeenCalledTimes(1);
    expect(api.putMaintenance).toHaveBeenCalledTimes(1);

    serverState = final;
    await act(async () => {
      maintenanceResponse.resolve(final);
    });
    await act(async () => {
      registrationResponse.resolve(afterRegistration);
    });

    await waitFor(() => {
      expect(
        toggle('server-registration-help').getAttribute('aria-pressed'),
      ).toBe('false');
      expect(
        toggle('server-maintenance-help').getAttribute('aria-pressed'),
      ).toBe('true');
    });
    expect(queryClient.getQueryData(['server-admin', 'settings'])).toEqual(
      final,
    );
  });
});
