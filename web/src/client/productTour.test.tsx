// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductTourProvider, useProductTour } from './productTour';

function OfferFixture() {
  const { offerVisible, hideOffer } = useProductTour();
  return offerVisible ? (
    <>
      <button type="button" onClick={() => hideOffer(false)}>
        Later
      </button>
      <button type="button" onClick={() => hideOffer(true)}>
        Do not show again
      </button>
    </>
  ) : null;
}

function renderTour(accountId = 'alex', spaceId = 'home') {
  return render(
    <MemoryRouter>
      <ProductTourProvider accountId={accountId} spaceId={spaceId}>
        <OfferFixture />
      </ProductTourProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('product introduction startup offer', () => {
  it('keeps Later local to this app session', () => {
    const first = renderTour();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
    expect(window.localStorage.length).toBe(0);

    first.unmount();
    renderTour();
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
  });

  it('remembers permanent dismissal in the existing viewer and Space scope', () => {
    const first = renderTour();
    fireEvent.click(screen.getByRole('button', { name: 'Do not show again' }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(window.localStorage.getItem('eimir:product-tour:v1:alex:home')).toBe(
      'seen',
    );

    first.unmount();
    const restarted = renderTour();
    expect(screen.queryByRole('button')).toBeNull();
    restarted.unmount();
    const otherAccount = renderTour('sam');
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
    otherAccount.unmount();
    renderTour('alex', 'other-space');
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
  });
});
