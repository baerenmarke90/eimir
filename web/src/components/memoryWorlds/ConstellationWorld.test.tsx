// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import copy from '../../i18n/locales/memoryWorlds';
import { haptic } from '../../motion/haptics';
import { entry } from './__fixtures__/stories';
import { ConstellationWorld } from './ConstellationWorld';
import type { MemoryWorldEntry } from './model';
import { SEEN_STARS_KEY } from './starChart';

vi.mock('../../motion/haptics', () => ({ haptic: vi.fn() }));

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const stars = copy.stars;

function memory(
  key: string,
  title: string,
  iso: string,
  overrides: Partial<MemoryWorldEntry> = {},
) {
  return entry(key, {
    title,
    date: new Date(`${iso}T12:00:00`),
    dateTime: iso,
    dateLabel: iso,
    ...overrides,
  });
}

// The lead comes first; the sky orders the stars by time.
const entries = [
  memory('b', 'By the lake', '2025-07-12', { isLead: true, kind: 'photo' }),
  memory('a', 'Our first walk', '2024-04-02'),
  memory('c', 'Thank you', '2025-11-20', { kind: 'heart', emotion: 'LOVED' }),
  memory('d', 'Moved in together', '2026-03-01', { kind: 'milestone' }),
];
const byTime = [
  'Our first walk',
  'By the lake',
  'Thank you',
  'Moved in together',
];

function starName(title: string) {
  const item = entries.find((candidate) => candidate.title === title);
  return fill(stars.star, { title, date: item?.dateLabel ?? '' });
}

function renderSky(list: MemoryWorldEntry[] = entries, onOpen = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <ConstellationWorld
        entries={list}
        kicker="Two years ago today"
        loadMemoryImage={vi.fn()}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
  const sky = screen.getByRole('group', { name: stars.label });
  return { ...view, sky, onOpen };
}

function starButton(title: string) {
  return screen.getByRole('button', { name: starName(title) });
}

function announcement() {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function cardLink(title: string) {
  const item = entries.find((candidate) => candidate.title === title);
  return screen.getByRole('link', {
    name: fill(stars.open, { title, date: item?.dateLabel ?? '' }),
  });
}

function motionAllowed() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function hapticKinds() {
  return vi.mocked(haptic).mock.calls.map(([kind]) => kind);
}

/** The sky is 400 × 340 px, so its own units are pixels. */
function measureSky(sky: HTMLElement) {
  vi.spyOn(sky, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 400,
    bottom: 340,
    width: 400,
    height: 340,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

/** Where a star button sits on the measured sky, in px. */
function centreOf(button: HTMLElement) {
  return {
    x: (Number.parseFloat(button.style.left) / 100) * 400,
    y: (Number.parseFloat(button.style.top) / 100) * 340,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.mocked(haptic).mockClear();
  window.localStorage.clear();
});

describe('ConstellationWorld', () => {
  it('shows every memory as a named star, ordered by time, with the lead lit', () => {
    const { sky } = renderSky();
    expect(screen.getByRole('heading', { name: stars.heading })).toBeTruthy();
    expect(sky.getAttribute('aria-roledescription')).toBe(
      stars.roleDescription,
    );
    expect(
      document.getElementById(sky.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toBe(stars.description);
    const buttons = within(sky)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('data-stars-star'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(
      byTime.map(starName),
    );
    // A roving tab stop: only the lit star is in the tab order.
    const lead = starButton('By the lake');
    expect(lead.getAttribute('aria-pressed')).toBe('true');
    expect(lead.tabIndex).toBe(0);
    expect(starButton('Thank you').tabIndex).toBe(-1);
    expect(
      screen.getByText(fill(stars.position, { position: 2, count: 4 })),
    ).toBeTruthy();
    expect(cardLink('By the lake')).toBeTruthy();
    expect(screen.getByRole('button', { name: stars.scope })).toBeTruthy();
    expect(screen.getByRole('button', { name: stars.wish })).toBeTruthy();
  });

  it('goes from star to star with the arrow keys and shows each memory', () => {
    renderSky();
    const lead = starButton('By the lake');
    lead.focus();
    fireEvent.keyDown(lead, { key: 'ArrowRight' });
    const next = starButton('Thank you');
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute('aria-pressed')).toBe('true');
    expect(next.tabIndex).toBe(0);
    expect(lead.getAttribute('aria-pressed')).toBe('false');
    expect(cardLink('Thank you')).toBeTruthy();
    expect(
      screen.getByText(fill(stars.position, { position: 3, count: 4 })),
    ).toBeTruthy();
    fireEvent.keyDown(next, { key: 'End' });
    expect(document.activeElement).toBe(starButton('Moved in together'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(starButton('Moved in together'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement).toBe(starButton('Our first walk'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(starButton('Our first walk'));
    expect(hapticKinds()).toEqual(['threshold', 'threshold', 'threshold']);
  });

  it('lights a tapped star and opens its memory from the card', () => {
    const { onOpen } = renderSky();
    fireEvent.click(starButton('Moved in together'));
    expect(starButton('Moved in together').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(hapticKinds()).toEqual(['commit']);
    fireEvent.click(cardLink('Moved in together'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      '/story/memories/d',
      'd',
    );
  });

  it('sends a shooting star from the keyboard and announces where it landed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderSky();
    const note = document.querySelector('.memory-stars-note');
    expect(note?.textContent).toBe(stars.note);
    expect(note?.hasAttribute('data-hidden')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: stars.wish }));
    // The first star other than the lit one; with reduced motion at once.
    expect(announcement()).toBe(
      fill(stars.landed.fling, { title: 'Our first walk', date: '2024-04-02' }),
    );
    expect(starButton('Our first walk').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(note?.getAttribute('data-hidden')).toBe('true');
    expect(hapticKinds()).toEqual(['moment']);
  });

  it('flies the shooting star frame by frame when motion is allowed', () => {
    motionAllowed();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    renderSky();
    fireEvent.click(screen.getByRole('button', { name: stars.wish }));
    expect(hapticKinds()).toEqual(['commit']);
    expect(announcement()).toBe('');
    const head = document.querySelector('.memory-stars-head');
    act(() => {
      frames.shift()?.(performance.now() + 100);
    });
    expect(head?.getAttribute('data-on')).toBe('true');
    expect(announcement()).toBe('');
    act(() => {
      while (frames.length) frames.shift()?.(performance.now() + 5000);
    });
    expect(head?.hasAttribute('data-on')).toBe(false);
    expect(announcement()).toBe(
      fill(stars.landed.fling, { title: 'Our first walk', date: '2024-04-02' }),
    );
  });

  it('lands a swipe across the sky on a star in that direction', () => {
    const { sky } = renderSky();
    measureSky(sky);
    fireEvent.pointerDown(sky, { pointerId: 1, clientX: 10, clientY: 120 });
    fireEvent.pointerMove(sky, { pointerId: 1, clientX: 60, clientY: 120 });
    fireEvent.pointerMove(sky, { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(sky, { pointerId: 1, clientX: 140, clientY: 120 });
    const landed = byTime.find(
      (title) => starButton(title).getAttribute('aria-pressed') === 'true',
    );
    expect(landed).toBeDefined();
    expect(landed).not.toBe('By the lake');
    const item = entries.find((candidate) => candidate.title === landed);
    expect(announcement()).toBe(
      fill(stars.landed.fling, {
        title: landed ?? '',
        date: item?.dateLabel ?? '',
      }),
    );
    expect(hapticKinds()).toEqual(['threshold', 'moment']);
  });

  it('traces the constellation from star to star', () => {
    const { sky } = renderSky();
    measureSky(sky);
    const first = starButton('Our first walk');
    const path = ['By the lake', 'Thank you'].map((title) =>
      centreOf(starButton(title)),
    );
    const start = centreOf(first);
    fireEvent.pointerDown(first, {
      pointerId: 2,
      clientX: start.x,
      clientY: start.y,
    });
    for (const point of path)
      fireEvent.pointerMove(sky, {
        pointerId: 2,
        clientX: point.x,
        clientY: point.y,
      });
    expect(first.getAttribute('data-traced')).toBe('true');
    expect(starButton('Thank you').getAttribute('data-traced')).toBe('true');
    const end = path[path.length - 1];
    fireEvent.pointerUp(sky, { pointerId: 2, clientX: end.x, clientY: end.y });
    expect(announcement()).toBe(
      fill(stars.landed.trace, { title: 'Thank you', date: '2025-11-20' }),
    );
    expect(starButton('Thank you').getAttribute('aria-pressed')).toBe('true');
  });

  it('points the telescope at a star and looks through it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    renderSky();
    const scope = screen.getByRole('button', { name: stars.scope });
    fireEvent.click(scope);
    expect(announcement()).toBe(
      fill(stars.landed.scope, {
        title: 'Moved in together',
        date: '2026-03-01',
      }),
    );
    const view = screen.getByRole('button', {
      name: fill(stars.view, {
        title: 'Moved in together',
        date: '2026-03-01',
      }),
    });
    expect(document.activeElement).toBe(view);
    // Escape looks away and returns to the telescope.
    fireEvent.keyDown(view, { key: 'Escape' });
    expect(
      screen.queryByRole('button', {
        name: fill(stars.view, {
          title: 'Moved in together',
          date: '2026-03-01',
        }),
      }),
    ).toBeNull();
    expect(document.activeElement).toBe(scope);
    expect(cardLink('Moved in together')).toBeTruthy();
    // Looking again, it swings to another star; a tap on the view leads on
    // to the card.
    fireEvent.click(scope);
    const again = screen.getByRole('button', {
      name: fill(stars.view, { title: 'Thank you', date: '2025-11-20' }),
    });
    fireEvent.click(again);
    expect(document.querySelector('.memory-stars-view')).toBeNull();
    expect(cardLink('Thank you')).toBeTruthy();
    expect(hapticKinds()).toEqual(['moment', 'moment']);
  });

  it('names how many memories became stars when there are more than fit', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      memory(
        `m${index}`,
        `Memory ${index}`,
        `2025-${String((index % 12) + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
        { isLead: index === 0 },
      ),
    );
    render(
      <MemoryRouter>
        <ConstellationWorld
          entries={many}
          kicker="Two years ago today"
          loadMemoryImage={vi.fn()}
          onOpen={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('group', {
        name: fill(stars.labelSome, { shown: 16, count: 20 }),
      }),
    ).toBeTruthy();
    expect(screen.getByText(fill(stars.oneOf, { count: 20 }))).toBeTruthy();
  });

  it('calls a single memory your first star', () => {
    renderSky([entries[0]]);
    expect(screen.getByText(stars.first)).toBeTruthy();
  });

  it('marks memories that are new in the sky since the last visit', () => {
    window.localStorage.setItem(SEEN_STARS_KEY, JSON.stringify(['a', 'b']));
    renderSky();
    expect(
      screen.getByRole('button', {
        name: fill(stars.starNew, { title: 'Thank you', date: '2025-11-20' }),
      }),
    ).toBeTruthy();
    // The newest of them gets the handwritten note.
    const note = document.querySelector('.memory-stars-newborn-note');
    expect(note?.textContent).toBe(stars.newborn);
    expect(
      document.querySelectorAll('.memory-stars-star[data-newborn="true"]'),
    ).toHaveLength(2);
    // This visit is remembered for the next one.
    expect(
      JSON.parse(window.localStorage.getItem(SEEN_STARS_KEY) ?? '[]').sort(),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('remembers the stars without newborn ones on the very first visit', () => {
    renderSky();
    expect(document.querySelector('[data-newborn]')).toBeNull();
    expect(document.querySelector('.memory-stars-newborn-note')).toBeNull();
  });

  it('follows the time of day', () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
    });
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0));
    const { container } = renderSky();
    const root = container.querySelector<HTMLElement>('.memory-stars-world');
    // Midday: the day sky, with the blue-black pencil, the stars untilted.
    expect(root?.style.getPropertyValue('--memory-stars-from-top')).toBe(
      'var(--memory-stars-day-top)',
    );
    expect(root?.dataset.pencil).toBe('ink');
    expect(root?.style.getPropertyValue('--memory-stars-turn')).toBe('0');
    // No frost or snow in June.
    expect(container.querySelector('.memory-stars-snow')).toBeNull();
    // Late in the evening, with the next minute tick: the night sky.
    act(() => {
      vi.setSystemTime(new Date(2026, 5, 10, 21, 59));
      vi.advanceTimersByTime(60_000);
    });
    expect(root?.style.getPropertyValue('--memory-stars-from-top')).toBe(
      'var(--memory-stars-night-top)',
    );
    expect(root?.dataset.pencil).toBeUndefined();
    expect(root?.style.getPropertyValue('--memory-stars-turn')).toBe('-4');
  });

  it('blends dawn into day and brings frost and snow in winter', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 0, 15, 6, 45));
    const { container } = renderSky();
    const root = container.querySelector<HTMLElement>('.memory-stars-world');
    expect(root?.style.getPropertyValue('--memory-stars-from-mid')).toBe(
      'var(--memory-stars-predawn-mid)',
    );
    expect(root?.style.getPropertyValue('--memory-stars-to-mid')).toBe(
      'var(--memory-stars-day-mid)',
    );
    expect(
      Number(root?.style.getPropertyValue('--memory-stars-blend')),
    ).toBeCloseTo(0.5, 2);
    expect(container.querySelector('.memory-stars-frost')).toBeTruthy();
    expect(
      container.querySelectorAll('.memory-stars-snow circle'),
    ).toHaveLength(18);
  });

  it('pauses its ambient loops while it is not seen', () => {
    const { container } = renderSky();
    const root = container.querySelector<HTMLElement>('.memory-stars-world');
    expect(root?.dataset.ambient).toBe('on');
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(root?.dataset.ambient).toBe('paused');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });
});
