// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import {
  HEART_EMOTIONS,
  HeartEmotionBadge,
  HeartEmotionPicker,
} from './HeartEmotionVisual';

afterEach(cleanup);

describe('HeartEmotionVisual', () => {
  it('renders all six domain emotions as one accessible single-choice picker', () => {
    render(
      <HeartEmotionPicker
        legend="Gefühl"
        defaultValue={HeartEmotion.APPRECIATED}
      />,
    );

    expect(screen.getByRole('group', { name: 'Gefühl' })).not.toBeNull();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(HEART_EMOTIONS.length);
    expect(radios).toHaveLength(6);
    expect(
      (screen.getByRole('radio', {
        name: 'Wertgeschätzt',
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: 'Geliebt' }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it('keeps the localized label alongside a distinct controlled motif', () => {
    const { container } = render(
      <HeartEmotionBadge emotion={HeartEmotion.SEEN} variant="detail" />,
    );

    expect(screen.getByText('Gesehen').textContent).toBe('Gesehen');
    const badge = container.querySelector('[data-emotion="SEEN"]');
    expect(badge).not.toBeNull();
    expect(badge?.querySelector('svg')).not.toBeNull();
    expect(badge?.textContent).toBe('Gefühl: Gesehen');
    expect(badge?.hasAttribute('aria-label')).toBe(false);
  });
});
