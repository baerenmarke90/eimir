// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import { DASHBOARD_MODULE_CATALOG } from '../client/dashboardModules';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import profileIdentity from '../i18n/locales/profileIdentity';
import m5s5 from '../i18n/locales/m5s5';
import { DashboardSettingsPanel } from './DashboardSettingsPanel';

const ACCOUNT_ID = 'account-1';
const SPACE_ID = 'space-1';

const DEFAULT_PREFERENCES = {
  items: [
    { moduleKey: 'upcoming', visible: true, itemLimit: 2 },
    { moduleKey: 'keepsake', visible: true },
    { moduleKey: 'relationship_signal', visible: true },
    { moduleKey: 'monthly_highlights', visible: true },
    { moduleKey: 'recent_shared', visible: true },
  ],
} as unknown as DashboardModulePreferenceList;

function renderPanel(
  updateDashboardModulePreference: DashboardApi['updateDashboardModulePreference'],
  preferences: DashboardModulePreferenceList = DEFAULT_PREFERENCES,
  updateDashboardModuleOrder: DashboardApi['updateDashboardModuleOrder'] = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID),
    preferences,
  );
  const dashboardApi = {
    listDashboardModulePreferences: vi.fn().mockResolvedValue(preferences),
    updateDashboardModulePreference,
    updateDashboardModuleOrder,
  } as unknown as DashboardApi;

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <DashboardSettingsPanel
          dashboardApi={dashboardApi}
          accountId={ACCOUNT_ID}
          spaceId={SPACE_ID}
        />
      </QueryClientProvider>,
    ),
  };
}

function moduleLabel(moduleKey: string): string {
  const entry = DASHBOARD_MODULE_CATALOG.find((item) => item.key === moduleKey);
  if (!entry) throw new Error(`Unknown module key: ${moduleKey}`);
  const path = entry.labelKey.split('.').slice(1);
  // biome-ignore lint/suspicious/noExplicitAny: walking a nested i18n resource tree
  let value: any = m5s5;
  for (const segment of path) value = value[segment];
  return value as string;
}

describe('DashboardSettingsPanel', () => {
  it('reorders with the keyboard, preserves a concurrent visibility choice and announces position', async () => {
    let finishOrder:
      | ((value: DashboardModulePreferenceList) => void)
      | undefined;
    const reorder = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finishOrder = resolve;
      }),
    );
    const toggle = vi
      .fn()
      .mockResolvedValue({ moduleKey: 'keepsake', visible: false });
    const { queryClient } = renderPanel(toggle, DEFAULT_PREFERENCES, reorder);

    const grip = screen.getByRole('button', {
      name: `${moduleLabel('keepsake')} verschieben`,
    });
    grip.focus();
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
    const desired = reorder.mock.calls[0][0].dashboardModuleOrderUpdate
      .moduleKeys as string[];
    expect(desired.indexOf('keepsake')).toBe(2);
    expect(document.activeElement).toBe(grip);

    fireEvent.click(
      screen.getByRole('checkbox', { name: moduleLabel('keepsake') }),
    );
    await waitFor(() => expect(toggle).toHaveBeenCalledTimes(1));
    await act(async () => {
      finishOrder?.({
        items: desired.map((moduleKey) => ({ moduleKey, visible: true })),
      });
    });
    await waitFor(() => {
      const cached = queryClient.getQueryData<DashboardModulePreferenceList>(
        dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID),
      );
      expect(cached?.items.map((item) => item.moduleKey)).toEqual(desired);
      expect(
        cached?.items.find((item) => item.moduleKey === 'keepsake')?.visible,
      ).toBe(false);
    });
    expect(grip.getAttribute('aria-describedby')).toBe(
      'dashboard-order-instructions',
    );
  });

  it('queues rapid keyboard reorders and restores the server order on a failed save', async () => {
    let finishFirst:
      | ((value: DashboardModulePreferenceList) => void)
      | undefined;
    const reorder = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('offline'));
    const { queryClient } = renderPanel(vi.fn(), DEFAULT_PREFERENCES, reorder);
    const grip = screen.getByRole('button', {
      name: `${moduleLabel('keepsake')} verschieben`,
    });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    const first = reorder.mock.calls[0][0].dashboardModuleOrderUpdate
      .moduleKeys as string[];
    await act(async () => {
      finishFirst?.({
        items: first.map((moduleKey) => ({ moduleKey, visible: true })),
      });
    });
    await waitFor(() => expect(reorder).toHaveBeenCalledTimes(2));
    await waitFor(() => screen.getByRole('alert'));
    await waitFor(() =>
      expect(
        queryClient
          .getQueryData<DashboardModulePreferenceList>(
            dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID),
          )
          ?.items.map((item) => item.moduleKey),
      ).toEqual(DEFAULT_PREFERENCES.items.map((item) => item.moduleKey)),
    );
  });

  it('exposes one understandable native 1/2/3 radio group', () => {
    renderPanel(vi.fn());

    screen.getByRole('group', {
      name: profileIdentity.dashboardUpcomingTitle,
    });
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(
      (screen.getByRole('radio', { name: '2' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: '1' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByRole('radio', { name: '3' }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('persists immediately and updates the Account+Space query cache', async () => {
    const update = vi.fn().mockResolvedValue({
      moduleKey: 'upcoming',
      visible: true,
      itemLimit: 3,
    });
    const { queryClient } = renderPanel(update);

    fireEvent.click(screen.getByRole('radio', { name: '3' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        moduleKey: 'upcoming',
        spaceId: SPACE_ID,
        dashboardModulePreferenceUpdate: { itemLimit: 3 },
      }),
    );
    await waitFor(() => {
      screen.getByText(profileIdentity.dashboardUpcomingSaved);
    });
    const cached = queryClient.getQueryData<DashboardModulePreferenceList>(
      dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID),
    );
    expect(cached?.items.find((item) => item.moduleKey === 'upcoming')).toEqual(
      { moduleKey: 'upcoming', visible: true, itemLimit: 3 },
    );
    expect(
      (screen.getByRole('radio', { name: '3' }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('keeps the pending choice visible while preventing duplicate changes', async () => {
    let resolveUpdate:
      | ((value: { moduleKey: string; itemLimit: number }) => void)
      | undefined;
    const update = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    renderPanel(update);

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: '3' }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        (screen.getByRole('radio', { name: '3' }) as HTMLInputElement).checked,
      ).toBe(true);
      expect(
        (screen.getByRole('radio', { name: '1' }) as HTMLInputElement).disabled,
      ).toBe(true);
    });
    screen.getByText(profileIdentity.dashboardUpcomingSaving);

    await act(async () => {
      resolveUpdate?.({ moduleKey: 'upcoming', itemLimit: 3 });
    });
  });

  it('restores the confirmed value when immediate persistence fails', async () => {
    const update = vi.fn().mockRejectedValue(new Error('network unavailable'));
    renderPanel(update);

    fireEvent.click(screen.getByRole('radio', { name: '1' }));

    await waitFor(() =>
      expect(
        (screen.getByRole('radio', { name: '2' }) as HTMLInputElement).checked,
      ).toBe(true),
    );
    screen.getByRole('alert');
  });

  describe('module visibility (#817)', () => {
    it('lists every registered module with an accessible checkbox, all shown by default', () => {
      renderPanel(vi.fn());

      for (const entry of DASHBOARD_MODULE_CATALOG) {
        const checkbox = screen.getByRole('checkbox', {
          name: moduleLabel(entry.key),
        }) as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
      }
    });

    it('reflects a hidden module from the loaded preferences', () => {
      renderPanel(vi.fn(), {
        items: [
          { moduleKey: 'upcoming', visible: true, itemLimit: 1 },
          { moduleKey: 'keepsake', visible: false },
          { moduleKey: 'relationship_signal', visible: true },
          { moduleKey: 'monthly_highlights', visible: true },
          { moduleKey: 'recent_shared', visible: true },
        ],
      } as unknown as DashboardModulePreferenceList);

      expect(
        (
          screen.getByRole('checkbox', {
            name: moduleLabel('keepsake'),
          }) as HTMLInputElement
        ).checked,
      ).toBe(false);
    });

    it('persists hiding one module immediately without touching another', async () => {
      const update = vi.fn().mockResolvedValue({
        moduleKey: 'keepsake',
        visible: false,
      });
      const { queryClient } = renderPanel(update);

      fireEvent.click(
        screen.getByRole('checkbox', { name: moduleLabel('keepsake') }),
      );

      await waitFor(() =>
        expect(update).toHaveBeenCalledWith({
          moduleKey: 'keepsake',
          spaceId: SPACE_ID,
          dashboardModulePreferenceUpdate: { visible: false },
        }),
      );
      await waitFor(() => {
        screen.getByText(profileIdentity.dashboardModuleSaved);
      });

      const cached = queryClient.getQueryData<DashboardModulePreferenceList>(
        dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID),
      );
      expect(
        cached?.items.find((item) => item.moduleKey === 'keepsake'),
      ).toEqual({ moduleKey: 'keepsake', visible: false });
      expect(
        (
          screen.getByRole('checkbox', {
            name: moduleLabel('recent_shared'),
          }) as HTMLInputElement
        ).checked,
      ).toBe(true);
    });

    it('disables only the pending row while a toggle is in flight', async () => {
      let resolveUpdate:
        | ((value: { moduleKey: string; visible: boolean }) => void)
        | undefined;
      const update = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
      );
      renderPanel(update);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('checkbox', { name: moduleLabel('keepsake') }),
        );
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          (
            screen.getByRole('checkbox', {
              name: moduleLabel('keepsake'),
            }) as HTMLInputElement
          ).disabled,
        ).toBe(true);
      });
      expect(
        (
          screen.getByRole('checkbox', {
            name: moduleLabel('recent_shared'),
          }) as HTMLInputElement
        ).disabled,
      ).toBe(false);
      screen.getByText(profileIdentity.dashboardModuleSaving);

      await act(async () => {
        resolveUpdate?.({ moduleKey: 'keepsake', visible: false });
      });
    });

    it('surfaces a ProblemState and keeps the confirmed value on failure', async () => {
      const update = vi
        .fn()
        .mockRejectedValue(new Error('network unavailable'));
      renderPanel(update);

      fireEvent.click(
        screen.getByRole('checkbox', { name: moduleLabel('keepsake') }),
      );

      await waitFor(() =>
        expect(
          (
            screen.getByRole('checkbox', {
              name: moduleLabel('keepsake'),
            }) as HTMLInputElement
          ).checked,
        ).toBe(true),
      );
      screen.getByRole('alert');
    });
  });
});
