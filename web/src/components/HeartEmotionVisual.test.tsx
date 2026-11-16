// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import {
  HEART_EMOTIONS,
  HeartEmotionBadge,
  HeartEmotionPicker,
  HeartEmotionSurface,
} from './HeartEmotionVisual';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.removeProperty(
    '--active-heart-emotion-surface',
  );
});

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

  it('keeps every feeling visible after a choice and reports native form resets', () => {
    const changed = vi.fn();
    const view = render(
      <form>
        <HeartEmotionPicker legend="Gefühl" onChange={changed} />
      </form>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Dankbar' }));
    expect(changed).toHaveBeenLastCalledWith(HeartEmotion.GRATEFUL);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(view.container.querySelector('details')).toBeNull();
    const form = view.container.querySelector('form');
    if (!form) throw new Error('The owning form is unavailable.');
    expect(new FormData(form).get('emotion')).toBe(HeartEmotion.GRATEFUL);
    act(() => form.reset());
    expect(changed).toHaveBeenLastCalledWith(HeartEmotion.LOVED);
    expect(new FormData(form).get('emotion')).toBe(HeartEmotion.LOVED);
  });

  it('tracks feeling and theme changes in browser chrome and restores the current theme on exit', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = 'baseline';
    document.head.append(meta);
    const getStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = getStyle(element);
      const values: Record<string, string> = {};
      const dark = document.documentElement.dataset.theme === 'dark';
      if (element.classList.contains('heart-emotion-page'))
        values['--heart-emotion-surface'] =
          `${dark ? 'dark' : 'light'}-${(element as HTMLElement).dataset.heartEmotion}`;
      if (element === document.documentElement)
        values['--color-background'] = dark ? 'dark-ground' : 'light-ground';
      return new Proxy(style, {
        get(target, key) {
          if (key === 'getPropertyValue')
            return (name: string) =>
              values[name] ?? target.getPropertyValue(name);
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    const view = render(
      <HeartEmotionSurface emotion={HeartEmotion.LOVED}>
        Content
      </HeartEmotionSurface>,
    );
    expect(meta.content).toBe('light-LOVED');
    view.rerender(
      <HeartEmotionSurface emotion={HeartEmotion.GRATEFUL}>
        Content
      </HeartEmotionSurface>,
    );
    expect(meta.content).toBe('light-GRATEFUL');
    act(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await waitFor(() => expect(meta.content).toBe('dark-GRATEFUL'));
    expect(
      document.documentElement.style.getPropertyValue(
        '--active-heart-emotion-surface',
      ),
    ).toBe('dark-GRATEFUL');
    view.unmount();
    expect(meta.content).toBe('dark-ground');
    expect(
      document.documentElement.style.getPropertyValue(
        '--active-heart-emotion-surface',
      ),
    ).toBe('');
    meta.remove();
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
