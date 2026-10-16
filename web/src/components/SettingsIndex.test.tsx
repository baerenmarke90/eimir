import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import de from '../i18n/locales/de';
import profileIdentity from '../i18n/locales/profileIdentity';
import { SettingsIndex } from './SettingsIndex';

describe('SettingsIndex', () => {
  it('exposes focused consumer settings categories in human-first order', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SettingsIndex />
      </MemoryRouter>,
    );

    const expected = [
      ['/more/settings/relationship', profileIdentity.settingsRelationship],
      ['/more/settings/notifications', profileIdentity.settingsNotifications],
      ['/more/settings/today', profileIdentity.settingsToday],
      ['/more/settings/appearance', de.theme.label],
      ['/more/settings/data', profileIdentity.settingsData],
      ['/more/settings/account', profileIdentity.settingsAccount],
    ] as const;

    for (const [href, label] of expected) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(label);
    }

    for (let index = 1; index < expected.length; index += 1) {
      expect(html.indexOf(`href="${expected[index - 1][0]}"`)).toBeLessThan(
        html.indexOf(`href="${expected[index][0]}"`),
      );
    }

    expect(html).not.toContain('href="#settings-');
    expect(html).not.toContain('settings-privacy');
  });
});
