import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { M4ProductApis } from '../client/m4Product';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import { spaceConfigurationQueryKey } from '../client/spaceConfiguration';
import '../i18n';
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

describe('Today weekly insights placement', () => {
  it('keeps weekly insights off Today while the daily rituals remain available', () => {
    const html = renderToday({
      vibeCheckEnabled: true,
      energyCheckInEnabled: true,
      partner: true,
    });

    expect(html).not.toContain('/more/insights');
    expect(html).toContain('daily-energy-checkin');
  });

  it('does not reintroduce the More destination for partial or partnerless daily states', () => {
    for (const options of [
      {
        vibeCheckEnabled: true,
        energyCheckInEnabled: false,
        partner: true,
      },
      {
        vibeCheckEnabled: false,
        energyCheckInEnabled: true,
        partner: true,
      },
      {
        vibeCheckEnabled: true,
        energyCheckInEnabled: true,
        partner: false,
      },
    ]) {
      expect(renderToday(options)).not.toContain('/more/insights');
    }
  });
});
