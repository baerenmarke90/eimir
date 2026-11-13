// @vitest-environment jsdom
import '../i18n';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { WishJourneyPath, WishOriginMark } from './WishJourney';

afterEach(cleanup);

describe('WishJourneyPath', () => {
  it('names all four steps and marks only the current one', () => {
    render(<WishJourneyPath stage="planned" />);
    const path = screen.getByRole('list', {
      name: i18n.t('wishJourney.pathLabel'),
    });
    const steps = within(path).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      i18n.t('wishJourney.stages.wished'),
      i18n.t('wishJourney.stages.planned'),
      i18n.t('wishJourney.stages.experienced'),
      i18n.t('wishJourney.stages.remembered'),
    ]);
    expect(steps.map((step) => step.getAttribute('aria-current'))).toEqual([
      null,
      'step',
      null,
      null,
    ]);
    expect(steps.map((step) => step.classList.contains('is-reached'))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(path.hasAttribute('data-advancing')).toBe(false);
  });

  it('marks the arrival for motion only when advancing', () => {
    render(<WishJourneyPath stage="experienced" tone="warm" advancing />);
    const path = screen.getByRole('list');
    expect(path.hasAttribute('data-advancing')).toBe(true);
    expect(path.classList.contains('wish-journey-tone-warm')).toBe(true);
  });
});

describe('WishOriginMark', () => {
  it('draws the sparkle as the shared decorative icon', () => {
    const { container } = render(
      <WishOriginMark>{i18n.t('wishJourney.planOrigin')}</WishOriginMark>,
    );
    const icon = container.querySelector('svg.eimir-icon-sparkle');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe(i18n.t('wishJourney.planOrigin'));
  });
});
