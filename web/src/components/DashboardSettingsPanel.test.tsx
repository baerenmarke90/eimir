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
import dailyQuote from '../i18n/locales/dailyQuote';
import relationshipReflections from '../i18n/locales/relationshipReflections';
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
    dashboardApi,
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
  if (moduleKey === 'daily_quote') return dailyQuote.title;
  if (moduleKey === 'shared_story_summary')
    return relationshipReflections.passport.wirStatisticsTitle;
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
    expect(desired.indexOf('keepsake')).toBe(3);
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

  describe('module order query ownership (#508)', () => {
    it('keeps a newer authorized server order when an older reorder finishes', async () => {
      let finishOrder:
        | ((value: DashboardModulePreferenceList) => void)
        | undefined;
      const reorder = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          finishOrder = resolve;
        }),
      );
      const { queryClient } = renderPanel(
        vi.fn(),
        DEFAULT_PREFERENCES,
        reorder,
      );
      const key = dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID);
      fireEvent.keyDown(
        screen.getByRole('button', {
          name: `${moduleLabel('keepsake')} verschieben`,
        }),
        { key: 'ArrowDown' },
      );
      await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
      const submitted = reorder.mock.calls[0][0].dashboardModuleOrderUpdate
        .moduleKeys as string[];
      const newerOrder = [
        ...DEFAULT_PREFERENCES.items.slice().reverse(),
      ] as DashboardModulePreferenceList['items'];
      queryClient.setQueryData<DashboardModulePreferenceList>(key, {
        items: newerOrder,
      });

      await act(async () => {
        finishOrder?.({
          items: submitted.map((moduleKey) => ({
            moduleKey,
            visible: true,
          })),
        });
      });
      expect(
        queryClient
          .getQueryData<DashboardModulePreferenceList>(key)
          ?.items.map((item) => item.moduleKey),
      ).toEqual(newerOrder.map((item) => item.moduleKey));
      expect(
        screen.queryByText(profileIdentity.dashboardModuleSaved),
      ).toBeNull();
    });

    it('does not recreate a removed and replaced Query from a late reorder success', async () => {
      let finishOrder:
        | ((value: DashboardModulePreferenceList) => void)
        | undefined;
      const reorder = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          finishOrder = resolve;
        }),
      );
      const { queryClient, dashboardApi } = renderPanel(
        vi.fn(),
        DEFAULT_PREFERENCES,
        reorder,
      );
      const key = dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID);
      fireEvent.keyDown(
        screen.getByRole('button', {
          name: `${moduleLabel('keepsake')} verschieben`,
        }),
        { key: 'ArrowDown' },
      );
      await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
      const submitted = reorder.mock.calls[0][0].dashboardModuleOrderUpdate
        .moduleKeys as string[];
      const replacement = {
        items: DEFAULT_PREFERENCES.items.slice().reverse(),
      } as DashboardModulePreferenceList;
      vi.mocked(dashboardApi.listDashboardModulePreferences).mockResolvedValue(
        replacement,
      );
      queryClient.removeQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, replacement);

      await act(async () => {
        finishOrder?.({
          items: submitted.map((moduleKey) => ({
            moduleKey,
            visible: true,
          })),
        });
      });
      expect(queryClient.getQueryData(key)).toEqual(replacement);
      expect(
        screen.queryByText(profileIdentity.dashboardModuleSaved),
      ).toBeNull();
    });

    it('does not invalidate a replacement Query or display a stale reorder failure', async () => {
      let failOrder: ((error: Error) => void) | undefined;
      const reorder = vi.fn().mockReturnValue(
        new Promise((_resolve, reject) => {
          failOrder = reject;
        }),
      );
      const { queryClient, dashboardApi } = renderPanel(
        vi.fn(),
        DEFAULT_PREFERENCES,
        reorder,
      );
      const key = dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID);
      fireEvent.keyDown(
        screen.getByRole('button', {
          name: `${moduleLabel('keepsake')} verschieben`,
        }),
        { key: 'ArrowDown' },
      );
      await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
      const replacement = {
        items: DEFAULT_PREFERENCES.items.slice().reverse(),
      } as DashboardModulePreferenceList;
      vi.mocked(dashboardApi.listDashboardModulePreferences).mockResolvedValue(
        replacement,
      );
      queryClient.removeQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, replacement);
      await waitFor(() =>
        expect(queryClient.getQueryData(key)).toEqual(replacement),
      );
      // Replacing an observed Query can legitimately trigger its own read.
      // Inspect the actual forbidden side effect, not the GET count.
      const invalidations = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        failOrder?.(new Error('request failed'));
      });
      await waitFor(() =>
        expect(
          queryClient.isMutating({
            mutationKey: ['dashboard-order', ACCOUNT_ID, SPACE_ID],
          }),
        ).toBe(0),
      );
      expect(queryClient.getQueryData(key)).toEqual(replacement);
      expect(invalidations).not.toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: key }),
      );
      expect(
        screen.queryByText(profileIdentity.dashboardOrderFailed),
      ).toBeNull();
    });

    it('keeps a new Account and Space unaffected by a previous reorder failure', async () => {
      let failOrder: ((error: Error) => void) | undefined;
      const reorder = vi.fn().mockReturnValue(
        new Promise((_resolve, reject) => {
          failOrder = reject;
        }),
      );
      const { queryClient, dashboardApi, rerender } = renderPanel(
        vi.fn(),
        DEFAULT_PREFERENCES,
        reorder,
      );
      fireEvent.keyDown(
        screen.getByRole('button', {
          name: `${moduleLabel('keepsake')} verschieben`,
        }),
        { key: 'ArrowDown' },
      );
      await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
      const nextKey = dashboardPreferencesQueryKey('account-2', 'space-2');
      const nextPreferences = {
        items: DEFAULT_PREFERENCES.items.slice().reverse(),
      } as DashboardModulePreferenceList;
      vi.mocked(dashboardApi.listDashboardModulePreferences).mockResolvedValue(
        nextPreferences,
      );
      queryClient.setQueryData(nextKey, nextPreferences);
      rerender(
        <QueryClientProvider client={queryClient}>
          <DashboardSettingsPanel
            dashboardApi={dashboardApi}
            accountId="account-2"
            spaceId="space-2"
          />
        </QueryClientProvider>,
      );

      await act(async () => {
        failOrder?.(new Error('request failed'));
      });
      expect(queryClient.getQueryData(nextKey)).toEqual(nextPreferences);
      expect(
        screen.queryByText(profileIdentity.dashboardOrderFailed),
      ).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
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

  describe('upcoming limit write ownership (#508)', () => {
    it('updates the authorized cache immediately and rejects rapid duplicate intent', async () => {
      let resolveUpdate:
        | ((value: { moduleKey: string; itemLimit: number }) => void)
        | undefined;
      const update = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
      );
      const { queryClient } = renderPanel(update);
      const key = dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID);

      fireEvent.click(screen.getByRole('radio', { name: '3' }));
      await waitFor(() =>
        expect(
          queryClient
            .getQueryData<DashboardModulePreferenceList>(key)
            ?.items.find((item) => item.moduleKey === 'upcoming')?.itemLimit,
        ).toBe(3),
      );
      fireEvent.click(screen.getByRole('radio', { name: '1' }));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      expect(
        (screen.getByRole('radio', { name: '1' }) as HTMLInputElement).disabled,
      ).toBe(true);
      expect(
        (screen.getByRole('radio', { name: '3' }) as HTMLInputElement).checked,
      ).toBe(true);

      await act(async () => {
        resolveUpdate?.({ moduleKey: 'upcoming', itemLimit: 3 });
      });
      await waitFor(() =>
        screen.getByText(profileIdentity.dashboardUpcomingSaved),
      );
    });

    it('serializes only conflicting Upcoming facets while other modules remain usable', async () => {
      const finish: Array<
        (value: {
          moduleKey: string;
          itemLimit?: number;
          visible?: boolean;
        }) => void
      > = [];
      const update = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish.push(resolve);
          }),
      );
      renderPanel(update);
      const radio = screen.getByRole('radio', {
        name: '3',
      }) as HTMLInputElement;
      const upcomingVisibility = screen.getByRole('checkbox', {
        name: moduleLabel('upcoming'),
      }) as HTMLInputElement;
      const keepsake = screen.getByRole('checkbox', {
        name: moduleLabel('keepsake'),
      }) as HTMLInputElement;

      fireEvent.click(radio);
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      expect(upcomingVisibility.disabled).toBe(true);
      expect(keepsake.disabled).toBe(false);

      fireEvent.click(keepsake);
      await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
      expect(upcomingVisibility.disabled).toBe(true);

      await act(async () => {
        finish[0]?.({ moduleKey: 'upcoming', itemLimit: 3 });
      });
      await waitFor(() => expect(upcomingVisibility.disabled).toBe(false));
      expect(keepsake.disabled).toBe(true);

      fireEvent.click(upcomingVisibility);
      await waitFor(() => expect(update).toHaveBeenCalledTimes(3));
      expect(
        (screen.getByRole('radio', { name: '1' }) as HTMLInputElement).disabled,
      ).toBe(true);

      await act(async () => {
        finish[2]?.({ moduleKey: 'upcoming', visible: false });
        finish[1]?.({ moduleKey: 'keepsake', visible: false });
      });
      await waitFor(() =>
        expect(
          (screen.getByRole('radio', { name: '1' }) as HTMLInputElement)
            .disabled,
        ).toBe(false),
      );
      expect(update).toHaveBeenCalledTimes(3);
      expect(
        (screen.getByRole('radio', { name: '3' }) as HTMLInputElement).checked,
      ).toBe(true);
    });

    it('preserves a newer authoritative Upcoming row after a late confirmation', async () => {
      let resolveUpdate:
        | ((value: { moduleKey: string; itemLimit: number }) => void)
        | undefined;
      const update = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
      );
      const { queryClient } = renderPanel(update);
      const key = dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID);
      fireEvent.click(screen.getByRole('radio', { name: '3' }));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));

      queryClient.setQueryData<DashboardModulePreferenceList>(
        key,
        (current) => ({
          items: (current?.items ?? []).map((item) =>
            item.moduleKey === 'upcoming'
              ? { ...item, itemLimit: 1, visible: false }
              : item,
          ),
        }),
      );

      await act(async () => {
        resolveUpdate?.({ moduleKey: 'upcoming', itemLimit: 3 });
      });
      await waitFor(() =>
        expect(
          (screen.getByRole('radio', { name: '1' }) as HTMLInputElement)
            .checked,
        ).toBe(true),
      );
      expect(
        queryClient
          .getQueryData<DashboardModulePreferenceList>(key)
          ?.items.find((item) => item.moduleKey === 'upcoming'),
      ).toMatchObject({ itemLimit: 1, visible: false });
    });

    it('never writes an old response into a removed and replaced preferences Query', async () => {
      let resolveUpdate:
        | ((value: { moduleKey: string; itemLimit: number }) => void)
        | undefined;
      const update = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
      );
      const { queryClient, dashboardApi } = renderPanel(update);
      const key = dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID);
      fireEvent.click(screen.getByRole('radio', { name: '3' }));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));

      const replacement = {
        items: DEFAULT_PREFERENCES.items.map((item) =>
          item.moduleKey === 'upcoming'
            ? { ...item, itemLimit: 1, visible: false }
            : item,
        ),
      } as DashboardModulePreferenceList;
      vi.mocked(dashboardApi.listDashboardModulePreferences).mockResolvedValue(
        replacement,
      );
      queryClient.removeQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, replacement);

      await act(async () => {
        resolveUpdate?.({ moduleKey: 'upcoming', itemLimit: 3 });
      });
      expect(queryClient.getQueryData(key)).toEqual(replacement);
    });

    it('keeps another Account and Space unaffected by an earlier result', async () => {
      let resolveUpdate:
        | ((value: { moduleKey: string; itemLimit: number }) => void)
        | undefined;
      const update = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
      );
      const { queryClient, dashboardApi, rerender } = renderPanel(update);
      const nextAccount = 'account-2';
      const nextSpace = 'space-2';
      const nextKey = dashboardPreferencesQueryKey(nextAccount, nextSpace);
      const nextPreferences = {
        items: DEFAULT_PREFERENCES.items.map((item) =>
          item.moduleKey === 'upcoming' ? { ...item, itemLimit: 1 } : item,
        ),
      } as DashboardModulePreferenceList;

      fireEvent.click(screen.getByRole('radio', { name: '3' }));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      vi.mocked(dashboardApi.listDashboardModulePreferences).mockResolvedValue(
        nextPreferences,
      );
      queryClient.setQueryData(nextKey, nextPreferences);
      rerender(
        <QueryClientProvider client={queryClient}>
          <DashboardSettingsPanel
            dashboardApi={dashboardApi}
            accountId={nextAccount}
            spaceId={nextSpace}
          />
        </QueryClientProvider>,
      );
      await waitFor(() =>
        expect(
          (screen.getByRole('radio', { name: '1' }) as HTMLInputElement)
            .checked,
        ).toBe(true),
      );

      await act(async () => {
        resolveUpdate?.({ moduleKey: 'upcoming', itemLimit: 3 });
      });
      expect(queryClient.getQueryData(nextKey)).toEqual(nextPreferences);
      expect(
        (screen.getByRole('radio', { name: '1' }) as HTMLInputElement).checked,
      ).toBe(true);
      expect(
        screen.queryByText(profileIdentity.dashboardUpcomingSaved),
      ).toBeNull();
    });
  });

  describe('module visibility (#817)', () => {
    it('lists every registered module with an accessible checkbox, all shown by default', () => {
      renderPanel(vi.fn());

      for (const entry of DASHBOARD_MODULE_CATALOG.filter(
        (entry) =>
          entry.key !== 'shared_story_summary' && entry.key !== 'daily_quote',
      )) {
        const checkbox = screen.getByRole('checkbox', {
          name: moduleLabel(entry.key),
        }) as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
      }
    });

    it('omits the temporarily retired story statistics control', () => {
      renderPanel(vi.fn());
      expect(
        screen.queryByRole('checkbox', {
          name: moduleLabel('shared_story_summary'),
        }),
      ).toBeNull();
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
        const checkbox = screen.getByRole('checkbox', {
          name: moduleLabel('keepsake'),
        }) as HTMLInputElement;
        fireEvent.click(checkbox);
        expect(checkbox.checked).toBe(false);
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

    it('keeps independent visibility toggles pending until each request settles', async () => {
      const resolveByModule = new Map<
        string,
        (value: { moduleKey: string; visible: boolean }) => void
      >();
      const update = vi.fn(
        ({ moduleKey }: { moduleKey: string }) =>
          new Promise<{ moduleKey: string; visible: boolean }>((resolve) => {
            resolveByModule.set(moduleKey, resolve);
          }),
      );
      const { queryClient } = renderPanel(update);
      const keepsake = screen.getByRole('checkbox', {
        name: moduleLabel('keepsake'),
      }) as HTMLInputElement;
      const recent = screen.getByRole('checkbox', {
        name: moduleLabel('recent_shared'),
      }) as HTMLInputElement;

      fireEvent.click(keepsake);
      fireEvent.click(recent);
      await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
      expect(keepsake.checked).toBe(false);
      expect(recent.checked).toBe(false);
      expect(keepsake.disabled).toBe(true);
      expect(recent.disabled).toBe(true);

      await act(async () => {
        resolveByModule.get('recent_shared')?.({
          moduleKey: 'recent_shared',
          visible: false,
        });
      });
      await waitFor(() => expect(recent.disabled).toBe(false));
      expect(keepsake.disabled).toBe(true);
      expect(keepsake.checked).toBe(false);

      await act(async () => {
        resolveByModule.get('keepsake')?.({
          moduleKey: 'keepsake',
          visible: false,
        });
      });
      await waitFor(() => expect(keepsake.disabled).toBe(false));
      const cached = queryClient.getQueryData<DashboardModulePreferenceList>(
        dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID),
      );
      expect(cached?.items.map((item) => item.moduleKey)).toEqual(
        DEFAULT_PREFERENCES.items.map((item) => item.moduleKey),
      );
      expect(
        cached?.items.find((item) => item.moduleKey === 'keepsake')?.visible,
      ).toBe(false);
      expect(
        cached?.items.find((item) => item.moduleKey === 'recent_shared')
          ?.visible,
      ).toBe(false);
    });

    it('does not overwrite a newer authorized read with an older toggle result', async () => {
      let resolveWrite:
        | ((value: { moduleKey: string; visible: boolean }) => void)
        | undefined;
      const update = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      );
      const { queryClient } = renderPanel(update);
      const keepsake = screen.getByRole('checkbox', {
        name: moduleLabel('keepsake'),
      }) as HTMLInputElement;

      fireEvent.click(keepsake);
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      const key = dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID);
      queryClient.setQueryData<DashboardModulePreferenceList>(
        key,
        (current) => ({
          items: (current?.items ?? []).map((item) =>
            item.moduleKey === 'keepsake'
              ? { ...item, visible: true, selectedCollectionId: 'newer-read' }
              : item,
          ),
        }),
      );

      await act(async () => {
        resolveWrite?.({ moduleKey: 'keepsake', visible: false });
      });
      await waitFor(() => expect(keepsake.disabled).toBe(false));
      expect(keepsake.checked).toBe(true);
      expect(
        queryClient
          .getQueryData<DashboardModulePreferenceList>(key)
          ?.items.find((item) => item.moduleKey === 'keepsake'),
      ).toMatchObject({ visible: true, selectedCollectionId: 'newer-read' });
    });

    it('never recreates a removed/replaced preference query from a late write', async () => {
      let resolveWrite:
        | ((value: { moduleKey: string; visible: boolean }) => void)
        | undefined;
      const update = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      );
      const { queryClient, dashboardApi } = renderPanel(update);
      fireEvent.click(
        screen.getByRole('checkbox', { name: moduleLabel('keepsake') }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      const key = dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID);
      const replacement = {
        items: DEFAULT_PREFERENCES.items.map((item) =>
          item.moduleKey === 'keepsake'
            ? { ...item, visible: true, selectedCollectionId: 'replacement' }
            : item,
        ),
      } as DashboardModulePreferenceList;
      // The active observer automatically re-fetches after cache removal.
      // That authoritative replacement read must agree with the new session
      // instead of re-introducing the fixture's earlier default response.
      vi.mocked(dashboardApi.listDashboardModulePreferences).mockResolvedValue(
        replacement,
      );
      queryClient.removeQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, replacement);

      await act(async () => {
        resolveWrite?.({ moduleKey: 'keepsake', visible: false });
      });
      expect(queryClient.getQueryData(key)).toEqual(replacement);
    });
  });
});
