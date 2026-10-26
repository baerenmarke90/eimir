import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import privateArea from '../i18n/locales/privateArea';
import { PrivateAreaProductPage } from './PrivateAreaProductPage';

function renderPrivateArea(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/more/private/*"
          element={
            <PrivateAreaProductPage
              api={{} as PrivateAreaApi}
              accountId="account-a"
              spaceId="space-a"
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrivateAreaProductPage', () => {
  it('renders the private hub instead of redirecting to notes', () => {
    const html = renderPrivateArea('/more/private');

    expect(html).toContain('private-area-reference-overview');
    expect(html).toContain(`href="/more"`);
    expect(html).toContain(privateArea.backToMore);
    expect(html).toContain('private-area-privacy-banner');
    // The same OWNER_ONLY header is rendered on every nested private route.
    // It must not imply secrecy outside the server-enforced in-app boundary.
    expect(privateArea.intro).toContain('eimir.');
    expect(html).toContain(
      `<p class="private-area-intro-text">${privateArea.intro}</p>`,
    );
    expect(html).toContain(privateArea.entry.privacy);
    // Privacy copy must identify its in-app access boundary, not imply
    // absolute secrecy beyond the server-enforced OWNER_ONLY policy.
    expect(privateArea.entry.privacy).toContain('eimir.');
    expect(html).toContain('href="/more/private/notes"');
    expect(html).toContain('href="/more/private/gift-ideas"');
    expect(html).toContain('href="/more/private/collections"');
    expect(html).toContain(privateArea.notes.intro);
    expect(html).toContain(privateArea.gifts.intro);
    expect(html).toContain(privateArea.collections.intro);
    for (const name of ['nurfuer', 'notes', 'geschenk', 'listen']) {
      expect(html).toContain(`eimir-icon-${name}`);
    }
    expect(html).not.toContain('class="private-area-nav"');
  });
});
