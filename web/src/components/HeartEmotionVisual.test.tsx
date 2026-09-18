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
    const { container } = render(
      <HeartEmotionPicker
        legend="Gefühl"
        defaultValue={HeartEmotion.APPRECIATED}
      />,
    );

    expect(screen.getByRole('group')).not.toBeNull();
    expect(container.querySelector('fieldset legend')?.textContent).toBe(
      'Gefühl',
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(HEART_EMOTIONS.length);
    expect(radios).toHaveLength(6);
    expect(
      (
        screen.getByRole('radio', {
          name: 'Wertgeschätzt',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: 'Geliebt' }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it.each(HEART_EMOTIONS)(
    'keeps compact %s localized and accessibly named while using the canonical icon',
    (emotion) => {
      const { container } = render(<HeartEmotionBadge emotion={emotion} />);

      const badge = container.querySelector(`[data-emotion="${emotion}"]`);
      const label = badge?.querySelector('.heart-emotion-label')?.textContent;
      expect(label).toBeTruthy();
      expect(badge?.classList).toContain('heart-emotion-badge--compact');
      expect(badge?.getAttribute('role')).toBe('img');
      expect(badge?.querySelector('svg')).not.toBeNull();
      expect(badge?.getAttribute('aria-label')).toBe(`Gefühl: ${label}`);
      expect(badge?.getAttribute('title')).toBe(`Gefühl: ${label}`);
      expect(badge?.getAttribute('aria-label')).not.toContain(emotion);
    },
  );

  it('keeps the localized label alongside a distinct controlled motif in detail', () => {
    const { container } = render(
      <HeartEmotionBadge emotion={HeartEmotion.SEEN} variant="detail" />,
    );

    expect(screen.getByText('Gesehen').textContent).toBe('Gesehen');
    const badge = container.querySelector('[data-emotion="SEEN"]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('role')).toBe('img');
    expect(badge?.querySelector('svg')).not.toBeNull();
    expect(badge?.textContent).toBe('Gefühl: Gesehen');
    expect(badge?.getAttribute('aria-label')).toBe('Gefühl: Gesehen');
    expect(badge?.getAttribute('title')).toBe('Gefühl: Gesehen');
  });
});
