import taskCopy from '../i18n/locales/taskBoundary';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { subpageParentPath } from '../client/routes';
import { SubpageNavigation } from './SubpageNavigation';
import { TaskBackButton, TaskBackLink } from './TaskBackButton';

afterEach(cleanup);

it.each(['/today', '/story', '/plan', '/more', '/story/'])(
  'keeps the primary destination %s free of Back chrome',
  (path) => {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <SubpageNavigation>
          <h1>Home</h1>
        </SubpageNavigation>
      </MemoryRouter>,
    );
    expect(container.querySelector('.back-link')).toBeNull();
  },
);

it('automatically supplies Back for an unregistered future secondary page and a safe parent', () => {
  render(
    <MemoryRouter initialEntries={['/more/future-area/new-screen']}>
      <Routes>
        <Route
          path="/more/future-area/new-screen"
          element={
            <SubpageNavigation>
              <h1>Future page</h1>
            </SubpageNavigation>
          }
        />
        <Route path="/more/future-area" element={<h1>Parent</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  const back = screen.getByRole('button', { name: taskCopy.back });
  expect(back.querySelector('svg')).not.toBeNull();
  expect(back.querySelector('.sr-only')?.textContent).toBe(taskCopy.back);
  fireEvent.click(back);
  expect(screen.getByRole('heading', { name: 'Parent' })).toBeTruthy();
});

it('places one page-owned guarded action above content and preserves its pending state', () => {
  const close = vi.fn();
  const { container, rerender } = render(
    <MemoryRouter initialEntries={['/plan/plans/new']}>
      <SubpageNavigation>
        <h1>Create</h1>
        <TaskBackButton disabled onClick={close}>
          Close task
        </TaskBackButton>
      </SubpageNavigation>
    </MemoryRouter>,
  );
  const back = screen.getByRole('button', { name: 'Close task' });
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(back.closest('.subpage-back-slot')).not.toBeNull();
  expect(container.firstElementChild?.contains(back)).toBe(true);
  fireEvent.click(back);
  expect(close).not.toHaveBeenCalled();
  rerender(
    <MemoryRouter initialEntries={['/plan/plans/new']}>
      <SubpageNavigation>
        <h1>Create</h1>
        <TaskBackButton onClick={close}>Close task</TaskBackButton>
      </SubpageNavigation>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close task' }));
  expect(close).toHaveBeenCalledOnce();
});

it('retains modified-click link semantics and replaces the default with the owning editor link', () => {
  render(
    <MemoryRouter initialEntries={['/story/memories/m/edit']}>
      <SubpageNavigation>
        <TaskBackLink to="/story/memories/m">Return to moment</TaskBackLink>
      </SubpageNavigation>
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button')).toBeNull();
  const link = screen.getByRole('link', { name: 'Return to moment' });
  expect(link.getAttribute('href')).toBe('/story/memories/m');
  expect(link.closest('.subpage-back-slot')).not.toBeNull();
});

it.each([
  ['/plan/chapters/chapter', '/story/chapters'],
  ['/plan/places/place', '/more/places'],
  ['/plan/collections/collection', '/more/collections'],
  ['/story/memories/m', '/story'],
  ['/story/memories/m/edit', '/story/memories/m'],
  ['/plan/wishes/new', '/plan'],
  ['/story/years/2026', '/story/years'],
  ['/more/settings/appearance', '/more/settings'],
  ['/games', '/more'],
  ['/search', '/more'],
])('maps direct entry %s to its canonical parent %s', (path, parent) => {
  expect(subpageParentPath(path)).toBe(parent);
});
