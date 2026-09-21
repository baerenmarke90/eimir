import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { M4ProductApis } from '../client/m4Product';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import { spaceConfigurationQueryKey } from '../client/spaceConfiguration';
import '../i18n';
import { DailyInsightsEntry } from './DailyInsightsEntry';
import { TodayPage } from './TodayPage';

function renderToday(options: {
  vibeCheckEnabled: boolean;
  energyCheckInEnabled: boolean;
  partner: boolean;
}): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
    space: {
      id: 'space-1',
      partner: options.partner
        ? { id: 'partner-1', displayName: 'Marie' }
        : null,
    },
    relationshipDuration: null,
    upcoming: [],
    recentShared: [],
    retrospective: null,
  });
  queryClient.setQueryData(
    dashboardPreferencesQueryKey('account-1', 'space-1'),
    { items: [] },
  );
  queryClient.setQueryData(spaceConfigurationQueryKey('account-1', 'space-1'), {
    configuration: {
      supportGesturesEnabled: true,
      energyCheckInEnabled: options.energyCheckInEnabled,
      vibeCheckEnabled: options.vibeCheckEnabled,
    },
    etag: '"1"',
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayPage
          apis={{} as M4ProductApis}
          spaceId="space-1"
          account={{ id: 'account-1', displayName: 'Alex' }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Today insights entry', () => {
  it('is one quiet link with a Pro mark and no capability read or dialog', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DailyInsightsEntry />
      </MemoryRouter>,
    );
    expect(html).toContain('href="/more/insights"');
    expect(html).toContain('Eure Woche');
    expect(html).toContain('Pro');
    expect(html).not.toMatch(/dialog|modal|upgrade|jetzt/i);
  });

  it('appears on Today when Vibe is enabled and a partner is connected', () => {
    const html = renderToday({
      vibeCheckEnabled: true,
      energyCheckInEnabled: false,
      partner: true,
    });
    expect(html).toContain('href="/more/insights"');
  });

  it('appears on Today when only Energy is enabled', () => {
    const html = renderToday({
      vibeCheckEnabled: false,
      energyCheckInEnabled: true,
      partner: true,
    });
    expect(html).toContain('href="/more/insights"');
    // The free daily Energy ritual on the avatars stays where it was.
    expect(html).toContain('daily-energy-checkin');
  });

  it('is absent when both daily modules are disabled', () => {
    const html = renderToday({
      vibeCheckEnabled: false,
      energyCheckInEnabled: false,
      partner: true,
    });
    expect(html).not.toContain('/more/insights');
  });

  it('is absent without a connected partner', () => {
    const html = renderToday({
      vibeCheckEnabled: true,
      energyCheckInEnabled: true,
      partner: false,
    });
    expect(html).not.toContain('/more/insights');
  });
});
