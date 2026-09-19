import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import accountSettings from '../i18n/locales/accountSettings';
import profileIdentity from '../i18n/locales/profileIdentity';
import spaceOffboarding from '../i18n/locales/spaceOffboarding';
import { SettingsPage } from './SettingsPage';

const SPACE_ID = 'space-1';
const ACCOUNT_ID = 'account-1';

function renderSettingsPageFixture(route = '/more/settings'): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  queryClient.setQueryData(['space', SPACE_ID], {
    id: SPACE_ID,
    partners: [
      { id: ACCOUNT_ID, displayName: 'Alex' },
      { id: 'account-2', displayName: 'Sam' },
    ],
  });

  queryClient.setQueryData(['profile-identity', SPACE_ID, 'account-2'], {
    accountId: 'account-2',
    displayName: 'Sam',
    profileAttachmentId: null,
    version: 1,
  });

  queryClient.setQueryData(['instance-status'], {
    registrationOpen: false,
    invitationsOpen: false,
  });

  queryClient.setQueryData(['space-profile', SPACE_ID], {
    relationshipStartedOn: '2022-02-14',
    showRelationshipDuration: true,
    durationDisplayMode: 'YEARS_MONTHS',
    relationshipYears: 3,
    relationshipMonths: 0,
    relationshipDays: null,
  });

  queryClient.setQueryData(
    ['rules', SPACE_ID, 'relationship_anniversary_reminder', 'preference'],
    {
      ruleKey: 'relationship_anniversary_reminder',
      enabled: true,
      parameters: {
        daysBefore: [30, 7, 1],
        localTime: '09:00:00',
      },
    },
  );
  queryClient.setQueryData(dashboardPreferencesQueryKey(ACCOUNT_ID, SPACE_ID), {
    items: [{ moduleKey: 'upcoming', itemLimit: 2 }],
  });

  const element = (
    <SettingsPage
      apiBaseUrl="http://api.example.test"
      accessToken="test-token"
      account={{ id: ACCOUNT_ID, displayName: 'Alex' }}
      spaceId={SPACE_ID}
    />
  );

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/more/settings" element={element} />
          <Route path="/more/settings/:settingsCategory" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  it('renders a calm category index instead of every settings form at once', () => {
    const html = renderSettingsPageFixture();

    expect(html).toContain('settings-index-page');
    expect(html).toContain('settings-index');
    expect(html).toContain('href="/more/settings/relationship"');
    expect(html).toContain('href="/more/settings/notifications"');
    expect(html).toContain('href="/more/settings/today"');
    expect(html).toContain('href="/more/settings/appearance"');
    expect(html).toContain('href="/more/settings/data"');
    expect(html).toContain('href="/more/settings/account"');
    expect(html).toContain('href="/more"');

    expect(html).not.toContain('name="relationshipStartedOn"');
    expect(html).not.toContain('anniversary-reminder-form');
    expect(html).not.toContain('name="dashboardUpcomingItemLimit"');
    expect(html).not.toContain('theme-control');
    expect(html).not.toContain('id="data-transfer"');
    expect(html).not.toContain('account-danger-zone');
  });

  it('renders one focused category task at a time with Back to Settings', () => {
    const relationship = renderSettingsPageFixture(
      '/more/settings/relationship',
    );
    expect(relationship).toContain('name="relationshipStartedOn"');
    expect(relationship).toContain('href="/more/settings"');
    expect(relationship).not.toContain('anniversary-reminder-form');
    expect(relationship).not.toContain('name="dashboardUpcomingItemLimit"');

    const notifications = renderSettingsPageFixture(
      '/more/settings/notifications',
    );
    expect(notifications).toContain('anniversary-reminder-form');
    expect(notifications).toContain('href="/more/notifications"');
    expect(notifications).not.toContain('name="relationshipStartedOn"');
    expect(notifications).not.toContain('name="dashboardUpcomingItemLimit"');

    const today = renderSettingsPageFixture('/more/settings/today');
    expect(today).toContain('name="dashboardUpcomingItemLimit"');
    expect(today).toContain(profileIdentity.dashboardUpcomingQuestion);
    expect(today).not.toContain('anniversary-reminder-form');
    expect(today).not.toContain('id="data-transfer"');

    const appearance = renderSettingsPageFixture('/more/settings/appearance');
    expect(appearance).toContain('theme-control');
    expect(appearance).not.toContain('id="data-transfer"');

    const data = renderSettingsPageFixture('/more/settings/data');
    expect(data).toContain('id="data-transfer"');
    expect(data).not.toContain('account-danger-zone');
  });

  it('keeps Account and Space destructive actions distinct inside the account category', () => {
    const html = renderSettingsPageFixture('/more/settings/account');

    expect(html).toContain(profileIdentity.settingsAccount);
    expect(html).toContain('settings-sensitive-zone');
    expect(html).toContain('account-settings-panel');
    expect(html).toContain('account-danger-zone');
    expect(html).toContain('<h3 id="account-settings-title">Account</h3>');
    expect(html).toContain(`<h4>${accountSettings.dangerTitle}</h4>`);
    expect(html).toContain(accountSettings.deleteAction);
    expect(html).toContain('space-offboarding-panel');
    expect(html).toContain(spaceOffboarding.action);

    expect(html).not.toContain('id="settings-privacy"');
    expect(html).not.toContain('/more/private');
    expect(html).not.toContain('partner-identity-title');
    expect(html).not.toContain('anniversary-reminder-form');
  });
});
