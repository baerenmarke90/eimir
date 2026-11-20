// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { subpageParentPath } from '../client/routes';
import taskCopy from '../i18n/locales/taskBoundary';
import { PageHeader } from './PageHeader';
import { SubpageNavigation } from './SubpageNavigation';
import { TaskBackButton, TaskBackLink } from './TaskBackButton';

afterEach(cleanup);

it.each([
  '/today',
  '/story',
  '/plan',
  '/more',
  '/story/',
  '/story/map',
  '/story/map/',
])('keeps the primary destination %s free of Back chrome', (path) => {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <SubpageNavigation>
        <h1>Home</h1>
      </SubpageNavigation>
    </MemoryRouter>,
  );
  expect(container.querySelector('.back-link')).toBeNull();
});

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
  expect(back.getAttribute('title')).toBe(taskCopy.back);
  expect(back.querySelector('svg')).not.toBeNull();
  expect(back.querySelector('.sr-only')?.textContent).toBe(taskCopy.back);
  fireEvent.click(back);
  expect(screen.getByRole('heading', { name: 'Parent' })).toBeTruthy();
});

it.each([
  '/more/insights',
  '/more/insights/patterns',
  '/story/recaps',
  '/story/recaps/edition',
  '/story/chapters',
  '/plan/chapters/chapter',
])('uses the shared chevron Back on the reading view %s (#2063)', (path) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SubpageNavigation>
        <PageHeader title="Reading view" />
      </SubpageNavigation>
    </MemoryRouter>,
  );

  const back = screen.getByRole('button', { name: taskCopy.back });
  expect(back.querySelector('.task-back-label')).toBeNull();
  expect(back.querySelector('svg')).not.toBeNull();
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
  expect(link.getAttribute('title')).toBe('Return to moment');
  expect(link.getAttribute('href')).toBe('/story/memories/m');
  expect(link.closest('.subpage-back-slot')).not.toBeNull();
});

it('keeps one inline task Back in its header while retaining shell ownership', () => {
  const close = vi.fn();
  const { container } = render(
    <MemoryRouter initialEntries={['/story/memories/new']}>
      <SubpageNavigation>
        <header data-testid="composer">
          <TaskBackButton inline onClick={close}>
            Close composer
          </TaskBackButton>
          <h1>Memory</h1>
        </header>
      </SubpageNavigation>
    </MemoryRouter>,
  );
  const back = screen.getByRole('button', { name: 'Close composer' });
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByTestId('composer').contains(back)).toBe(true);
  expect(container.querySelector('.subpage-back-slot')?.childElementCount).toBe(
    0,
  );
  fireEvent.click(back);
  expect(close).toHaveBeenCalledOnce();
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

describe('secondary-page header row (#1907 C4)', () => {
  function renderAt(path: string, page: ReactNode) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SubpageNavigation>{page}</SubpageNavigation>
      </MemoryRouter>,
    );
  }

  it('puts the default Back beside the page title instead of a separate row', () => {
    const { container } = renderAt(
      '/more/places',
      <PageHeader eyebrow="More" title="Places" description="Saved places" />,
    );
    const row = container.querySelector('.page-heading-title-row');
    expect(row?.querySelector('.task-back-control')).not.toBeNull();
    expect(row?.querySelector('h1')?.textContent).toBe('Places');
    expect(container.querySelectorAll('.task-back-control')).toHaveLength(1);
    expect(
      container.querySelector('.subpage-back-slot')?.childElementCount,
    ).toBe(0);
    expect(container.querySelector('.eyebrow')).toBeNull();
  });

  it('moves a page-owned guarded Back into the same row', () => {
    const close = vi.fn();
    const { container } = renderAt(
      '/plan/chapters/new',
      <PageHeader
        before={<TaskBackButton onClick={close} />}
        title="New chapter"
      />,
    );
    const back = container.querySelector(
      '.page-heading-title-row .task-back-control',
    );
    expect(back).not.toBeNull();
    expect(container.querySelectorAll('.task-back-control')).toHaveLength(1);
    fireEvent.click(back as Element);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps the shell row for a page without a heading', () => {
    const { container } = renderAt('/more/places', <p>Loading</p>);
    expect(
      container.querySelector('.subpage-back-slot .task-back-control'),
    ).not.toBeNull();
  });

  it('hosts Back in the first heading of the page only', () => {
    const { container } = renderAt(
      '/more/places',
      <>
        <PageHeader title="First" />
        <PageHeader title="Second" />
      </>,
    );
    const rows = container.querySelectorAll('.page-heading-title-row');
    expect(rows[0].querySelector('.task-back-control')).not.toBeNull();
    expect(rows[1].querySelector('.task-back-control')).toBeNull();
  });

  it('shows one named item with its type label, Back and edit in one row', () => {
    const { container } = renderAt(
      '/plan/chapters/chapter-1',
      <PageHeader
        itemLabel="Shared chapter"
        title="Summer by the sea"
        titleAction={<button type="button">Edit</button>}
      />,
    );
    const row = container.querySelector('.page-heading-item-row');
    expect(row?.querySelector('.task-back-control')).not.toBeNull();
    expect(row?.querySelector('.page-heading-item-label')?.textContent).toBe(
      'Shared chapter',
    );
    expect(
      row?.querySelector('button:not(.task-back-control)')?.textContent,
    ).toBe('Edit');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Summer by the sea' }),
    ).toBeTruthy();
  });

  it('leaves primary roots and their headings without Back', () => {
    const { container } = renderAt(
      '/more',
      <PageHeader variant="root" title="More" />,
    );
    expect(container.querySelector('.task-back-control')).toBeNull();
    expect(container.querySelector('.page-back-host')).toBeNull();
  });
});
