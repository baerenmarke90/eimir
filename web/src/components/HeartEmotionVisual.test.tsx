// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
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

  it('preserves the selected feeling in FormData after collapsing the compact choice', () => {
    const view = render(
      <form>
        <HeartEmotionPicker compact legend="Gefühl" />
      </form>,
    );
    const disclosure = view.container.querySelector(
      'details',
    ) as HTMLDetailsElement;
    disclosure.open = true;
    fireEvent.click(screen.getByRole('radio', { name: 'Unterstützt' }));
    disclosure.open = false;
    const form = view.container.querySelector('form');
    if (!form) throw new Error('The owning form is unavailable.');
    expect(new FormData(form).get('emotion')).toBe(HeartEmotion.SUPPORTED);
    expect(disclosure.querySelector('summary')?.textContent).toContain(
      'Unterstützt',
    );
    expect(disclosure.querySelectorAll('input[name="emotion"]')).toHaveLength(
      6,
    );
  });

  it.each(HEART_EMOTIONS)(
    'resets native selection and the compact summary to the saved %s feeling together',
    (emotion) => {
      const otherEmotion = HEART_EMOTIONS.find((value) => value !== emotion);
      if (!otherEmotion) throw new Error('Another feeling is unavailable.');
      const view = render(
        <form>
          <HeartEmotionPicker compact legend="Gefühl" defaultValue={emotion} />
        </form>,
      );
      const form = view.container.querySelector('form');
      const disclosure = view.container.querySelector('details');
      if (!form || !disclosure)
        throw new Error('The owning form or disclosure is unavailable.');
      const initialLabel = disclosure.querySelector('summary')?.textContent;
      disclosure.open = true;
      const nextRadio = form.querySelector(
        `input[name="emotion"][value="${otherEmotion}"]`,
      );
      if (!nextRadio) throw new Error('The next feeling is unavailable.');
      fireEvent.click(nextRadio);
      disclosure.open = false;
      expect(new FormData(form).get('emotion')).toBe(otherEmotion);

      act(() => form.reset());

      expect(new FormData(form).get('emotion')).toBe(emotion);
      expect(disclosure.querySelector('summary')?.textContent).toBe(
        initialLabel,
      );
      expect(
        form.querySelectorAll('input[name="emotion"]:checked'),
      ).toHaveLength(1);
      expect(
        form
          .querySelector('input[name="emotion"]:checked')
          ?.getAttribute('value'),
      ).toBe(emotion);
    },
  );

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
