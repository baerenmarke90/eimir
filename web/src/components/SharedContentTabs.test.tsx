// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MORE_COLLECTIONS_ROUTE, MORE_NOTES_ROUTE } from '../client/routes';
import navigation from '../i18n/locales/navigation';
import { SharedContentTabs } from './SharedContentTabs';

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderAt(path: string, view: 'lists' | 'notes') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SharedContentTabs activeView={view} />
      <Routes>
        <Route path="*" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SharedContentTabs', () => {
  it('marks the active peer view and names both views', () => {
    renderAt(MORE_COLLECTIONS_ROUTE, 'lists');
    const lists = screen.getByRole('tab', { name: navigation.sharedLists });
    const notes = screen.getByRole('tab', { name: navigation.sharedNotes });
    expect(lists.getAttribute('aria-selected')).toBe('true');
    expect(notes.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe(
      navigation.sharedViewsAria,
    );
  });

  it('switches to the sibling view without stacking history', () => {
    renderAt(MORE_COLLECTIONS_ROUTE, 'lists');
    fireEvent.click(screen.getByRole('tab', { name: navigation.sharedNotes }));
    expect(screen.getByTestId('path').textContent).toBe(MORE_NOTES_ROUTE);
  });

  it('keeps the current address when the active view is tapped again', () => {
    renderAt(MORE_NOTES_ROUTE, 'notes');
    fireEvent.click(screen.getByRole('tab', { name: navigation.sharedNotes }));
    expect(screen.getByTestId('path').textContent).toBe(MORE_NOTES_ROUTE);
  });
});
