// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import privateArea from '../i18n/locales/privateArea';
import { PrivateAreaProductPage } from './PrivateAreaProductPage';

vi.mock('./PrivateNotesPage', () => ({
  PrivateNotesListPage: () => <p>notes-list</p>,
  PrivateNoteCreatePage: () => null,
  PrivateNoteDetailPage: () => null,
  PrivateNoteEditPage: () => null,
}));

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderPrivateArea(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
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
  it('opens on the first section instead of a second picker', () => {
    renderPrivateArea('/more/private');

    expect(screen.getByTestId('where').textContent).toBe('/more/private/notes');
    expect(screen.getByText('notes-list')).toBeTruthy();
    // The chips are the only way between sections; no card hub exists.
    const nav = screen.getByRole('navigation', {
      name: privateArea.navigation.aria,
    });
    expect(nav.querySelectorAll('a')).toHaveLength(4);
    expect(document.querySelector('.private-area-destination-card')).toBeNull();
    // The OWNER_ONLY header must not imply secrecy outside the server-enforced
    // in-app boundary.
    expect(privateArea.intro).toContain('eimir.');
    expect(screen.getByText(privateArea.intro)).toBeTruthy();
  });
});
