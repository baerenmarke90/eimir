// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextTagList } from './ContextTagList';

afterEach(cleanup);

function TagNavigationProbe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="query">{location.search}</span>
      <span data-testid="tag">
        {String((location.state as { selectedTag?: string } | null)?.selectedTag ?? '')}
      </span>
    </div>
  );
}

describe('ContextTagList', () => {
  it('makes authored tags touch-reachable and passes an exact tag privately', async () => {
    render(
      <MemoryRouter initialEntries={['/story/memories/example']}>
        <Routes>
          <Route
            path="/story/memories/example"
            element={
              <ContextTagList
                tags={['out_together', 'Private winter trip']}
                presentation="composer"
              />
            }
          />
          <Route path="/search" element={<TagNavigationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const tag = screen.getByRole('link', {
      name: 'Alle Einträge mit Tag „Private winter trip“ ansehen',
    });
    expect(tag.getAttribute('href')).toBe('/search');
    await userEvent.setup().click(tag);
    expect(screen.getByTestId('pathname').textContent).toBe('/search');
    expect(screen.getByTestId('query').textContent).toBe('');
    expect(screen.getByTestId('tag').textContent).toBe('Private winter trip');
  });

  it('uses the Heart Moment label resolver without losing the authored key', async () => {
    render(
      <MemoryRouter initialEntries={['/story/heart-moments/one']}>
        <Routes>
          <Route
            path="/story/heart-moments/one"
            element={
              <ContextTagList
                tags={['everyday']}
                labelForTag={() => 'Special moments'}
              />
            }
          />
          <Route path="/search" element={<TagNavigationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.setup().click(
      screen.getByRole('link', {
        name: 'Alle Einträge mit Tag „Special moments“ ansehen',
      }),
    );
    expect(screen.getByTestId('tag').textContent).toBe('everyday');
  });
});
