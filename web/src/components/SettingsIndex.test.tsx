import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import de from '../i18n/locales/de';
import photoSources from '../i18n/locales/photoSources';
import profileIdentity from '../i18n/locales/profileIdentity';
import { SettingsIndex } from './SettingsIndex';

describe('SettingsIndex', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <SettingsIndex />
    </MemoryRouter>,
  );

  it('groups settings by whose they are, in human-first order', () => {
    const expected = [
      [
        profileIdentity.settingsGroupCouple,
        [
          ['/more/settings/relationship', profileIdentity.settingsRelationship],
          ['/more/settings/shared', profileIdentity.spaceConfigurationTitle],
        ],
      ],
      [
        profileIdentity.settingsGroupPersonal,
        [
          [
            '/more/settings/notifications',
            profileIdentity.settingsNotifications,
          ],
          ['/more/settings/today', profileIdentity.settingsToday],
          ['/more/settings/appearance', de.theme.label],
        ],
      ],
      [
        profileIdentity.settingsGroupConnections,
        [['/more/settings/media', photoSources.settingsTitle]],
      ],
      [
        profileIdentity.settingsGroupAccount,
        [
          ['/more/settings/data', profileIdentity.settingsData],
          ['/more/settings/account', profileIdentity.settingsAccount],
        ],
      ],
    ] as const;

    let cursor = -1;
    for (const [groupTitle, rows] of expected) {
      const groupAt = html.indexOf(`>${groupTitle}</h2>`);
      expect(groupAt, groupTitle).toBeGreaterThan(cursor);
      cursor = groupAt;
      for (const [href, label] of rows) {
        const rowAt = html.indexOf(`href="${href}"`);
        expect(rowAt, href).toBeGreaterThan(cursor);
        expect(html).toContain(label);
        cursor = rowAt;
      }
    }

    expect(html).not.toContain('href="#settings-');
    expect(html).not.toContain('settings-privacy');
  });

  it('shows one short line per row and marks Pro connections', () => {
    expect(html).toContain(profileIdentity.settingsNotificationsSummary);
    expect(html).toContain(profileIdentity.settingsSharedSummary);
    expect(html).not.toContain(profileIdentity.settingsNotificationsIntro);
    expect(html).toContain('pro-mark');
  });
});
