// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { ProductTourProvider, useProductTour } from './productTour';

function Fixture({
  accountId = 'alex',
  spaceId = 'home',
}: {
  accountId?: string;
  spaceId?: string;
}) {
  const { replay } = useProductTour();
  const location = useLocation();
  return (
    <>
      <main id="main-content" tabIndex={-1}>
        {location.pathname}
      </main>
      <button type="button" onClick={replay}>
        Replay from More
      </button>
      <Link to="/today">Use app normally</Link>
      <div className="mobile-quick-create">
        <button type="button" className="quick-create-trigger">
          Actual plus
        </button>
      </div>
      <span>
        {accountId}:{spaceId}
      </span>
    </>
  );
}

function renderTour(route = '/more', accountId = 'alex', spaceId = 'home') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ProductTourProvider accountId={accountId} spaceId={spaceId}>
        <Fixture accountId={accountId} spaceId={spaceId} />
      </ProductTourProvider>
    </MemoryRouter>,
  );
}

const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('optional product tour', () => {
  it('offers first-use help on More, dismisses it per viewer and Space, and permits replay', () => {
    const first = renderTour();
    expect(
      screen.getByRole('heading', { name: 'Ein kurzer Blick auf eimir.' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Später' }));
    expect(
      screen.queryByRole('heading', { name: 'Ein kurzer Blick auf eimir.' }),
    ).toBeNull();
    expect(window.localStorage.getItem('eimir:product-tour:v1:alex:home')).toBe(
      'seen',
    );
    first.unmount();

    renderTour();
    expect(
      screen.queryByRole('heading', { name: 'Ein kurzer Blick auf eimir.' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Replay from More' }));
    expect(
      screen.getByRole('heading', { name: 'Euer gemeinsamer Ort' }),
    ).toBeTruthy();
    expect(screen.getByRole('main').textContent).toBe('/today');
    cleanup();

    renderTour('/more', 'sam', 'home');
    expect(
      screen.getByRole('heading', { name: 'Ein kurzer Blick auf eimir.' }),
    ).toBeTruthy();
    cleanup();
    renderTour('/more', 'alex', 'other-space');
    expect(
      screen.getByRole('heading', { name: 'Ein kurzer Blick auf eimir.' }),
    ).toBeTruthy();
  });

  it('visits the real routes and opens the real plus action without blocking ordinary use', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const plus = vi.fn();
    renderTour();
    screen
      .getByRole('button', { name: 'Actual plus' })
      .addEventListener('click', plus);
    fireEvent.click(screen.getByRole('button', { name: 'Ansehen' }));
    expect(screen.getByRole('main').textContent).toBe('/today');
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('main').textContent).toBe('/story');
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('main').textContent).toBe('/plan');
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(
      screen.getByRole('heading', { name: 'Etwas festhalten' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Plus öffnen' }));
    expect(plus).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('heading', { name: 'Etwas festhalten' }),
    ).toBeNull();
  });

  it('treats ordinary navigation away from the invitation as dismissal', () => {
    renderTour();
    fireEvent.click(screen.getByRole('link', { name: 'Use app normally' }));
    expect(screen.getByRole('main').textContent).toBe('/today');
    expect(window.localStorage.getItem('eimir:product-tour:v1:alex:home')).toBe(
      'seen',
    );
  });
});
