import '../i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import type { M4ProductApis } from '../client/m4Product';
import { partnerPresenceQueryKey } from '../client/presence';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import { TodayPage } from './TodayPage';

function renderPresence(
  state: 'ACTIVE' | 'RECENT' | null | undefined,
  withPartner = true,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
    space: {
      id: 'space-1',
      partner: withPartner ? { id: 'partner-1', displayName: 'Marie' } : null,
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
  if (state !== undefined) {
    queryClient.setQueryData(partnerPresenceQueryKey('account-1', 'space-1'), {
      state,
    });
  }

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

describe('Today partner presence', () => {
  it('does not turn partner membership into an online claim', () => {
    const html = renderPresence(undefined);
    expect(html).not.toContain(relationshipComponents.couplePresenceActive);
    expect(html).not.toContain(relationshipComponents.couplePresenceRecent);
    expect(html).not.toContain('partner-presence-pip');
  });

  it('renders active and recent partner-attributed states distinctly', () => {
    const active = renderPresence('ACTIVE');
    expect(active).toContain(
      relationshipComponents.couplePresencePartnerActive.replace(
        '{{name}}',
        'Marie',
      ),
    );
    expect(active).toContain('partner-presence-avatar-state status-active');
    expect(active).not.toContain(
      `>${relationshipComponents.couplePresenceActive}<`,
    );

    const recent = renderPresence('RECENT');
    expect(recent).toContain(
      relationshipComponents.couplePresencePartnerRecent.replace(
        '{{name}}',
        'Marie',
      ),
    );
    expect(recent).toContain('partner-presence-avatar-state status-recent');
    expect(recent).not.toContain(
      `>${relationshipComponents.couplePresenceRecent}<`,
    );
  });

  it('keeps the existing waiting state when no partner exists', () => {
    expect(renderPresence(null, false)).toContain(
      relationshipComponents.couplePresenceWaiting,
    );
  });
});
