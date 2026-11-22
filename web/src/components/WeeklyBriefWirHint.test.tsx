// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { WeeklyBriefView } from '../api/generated/models/WeeklyBriefView';
import {
  quietHintRetired,
  resetQuietHintsForTests,
} from '../client/quietHints';
import dailyInsights from '../i18n/locales/dailyInsights';
import '../i18n';
import {
  lastCompletedMonday,
  WeeklyBriefWirHint,
  weeklyBriefHintId,
} from './WeeklyBriefWirHint';

const hint = dailyInsights.brief.wirHint;

function brief(extra: Partial<WeeklyBriefView> = {}): WeeklyBriefView {
  return {
    weekStart: new Date('2026-11-16'),
    weekEnd: new Date('2026-11-22'),
    elapsedDays: 7,
    jointDays: 4,
    headline: 'GOOD_DAYS',
    goodDays: [],
    sharedDays: [],
    attentionDays: 0,
    wishes: [],
    newObservations: [],
    ...extra,
  };
}

function renderHint({
  capabilities = ['daily.insights'],
  view = brief(),
  modulesEnabled = true,
}: {
  capabilities?: string[];
  view?: WeeklyBriefView;
  modulesEnabled?: boolean;
} = {}) {
  const weekly = vi.fn(async () => view);
  const entitlementApi = {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: vi.fn(async () => ({
      spaceId: 'space-1',
      capabilities,
      status: 'ACTIVE',
      tier: 'PRO',
      isInGracePeriod: false,
    })),
  } as unknown as EntitlementsApi;
  const dailyCheckInsApi = {
    getDailyCheckInWeeklyBrief: weekly,
  } as unknown as DailyCheckInsApi;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <WeeklyBriefWirHint
          accountId="account-1"
          spaceId="space-1"
          dailyCheckInsApi={dailyCheckInsApi}
          entitlementApi={entitlementApi}
          modulesEnabled={modulesEnabled}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { weekly };
}

beforeEach(() => {
  localStorage.clear();
  resetQuietHintsForTests();
});
afterEach(() => cleanup());

describe('Weekly brief hint on Wir (#2194)', () => {
  it('computes the Monday of the last completed week', () => {
    expect(lastCompletedMonday('2026-11-22')).toBe('2026-11-09');
    expect(lastCompletedMonday('2026-11-23')).toBe('2026-11-16');
  });

  it('links Pro couples to last week’s brief and retires on dismissal', async () => {
    const { weekly } = renderHint();
    const link = await screen.findByRole('link', { name: hint.open });
    const monday = lastCompletedMonday();
    expect(link.getAttribute('href')).toBe(`/more/insights?week=${monday}`);
    expect(screen.getByText(hint.text)).toBeTruthy();
    expect(weekly).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: hint.later }));
    await vi.waitFor(() =>
      expect(
        quietHintRetired('account-1', 'space-1', weeklyBriefHintId(monday)),
      ).toBe(true),
    );
  });

  it('stays silent for Free Spaces and never reads the brief', async () => {
    const { weekly } = renderHint({ capabilities: [] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(hint.text)).toBeNull();
    expect(weekly).not.toHaveBeenCalled();
  });

  it('stays silent when last week has nothing to show', async () => {
    const { weekly } = renderHint({ view: brief({ jointDays: 0 }) });
    await vi.waitFor(() => expect(weekly).toHaveBeenCalled());
    expect(screen.queryByText(hint.text)).toBeNull();
  });

  it('stays silent when Vibe and Energy are both off', async () => {
    const { weekly } = renderHint({ modulesEnabled: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(hint.text)).toBeNull();
    expect(weekly).not.toHaveBeenCalled();
  });
});
