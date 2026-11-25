// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import copy from '../../i18n/locales/memoryWorlds';
import { entry } from './__fixtures__/stories';
import { hexSpiral, MomentCloudWorld } from './MomentCloudWorld';

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

// Without matchMedia the app's reduced-motion source reports reduced motion:
// every settle and the card resolve at once, so the world is deterministic.
const entries = [
  entry('c', {
    kind: 'milestone',
    title: 'Moved in together',
    date: new Date('2024-06-01T00:00:00Z'),
    dateTime: '2024-06-01',
    dateLabel: 'June 1, 2024',
  }),
  entry('a', {
    isLead: true,
    title: 'By the lake',
    dateLabel: 'August 24, 2026',
  }),
  entry('b', {
    kind: 'heart',
    emotion: 'LOVED',
    title: 'Thank you',
    date: new Date('2025-02-14T00:00:00Z'),
    dateTime: '2025-02-14',
    dateLabel: 'February 14, 2025',
  }),
  entry('d', {
    title: 'Picnic in the park',
    date: new Date('2026-05-01T00:00:00Z'),
    dateTime: '2026-05-01',
    dateLabel: 'May 1, 2026',
  }),
];

const KICKER = 'Two years ago today';

function renderCloud(onOpen = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <MomentCloudWorld
        entries={entries}
        kicker={KICKER}
        loadMemoryImage={vi.fn()}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
  const stage = screen.getByRole('group', {
    name: fill(copy.cloud.label_other, { count: 4 }),
  });
  return { ...view, stage };
}

function announcement() {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function motionAllowed() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('hexSpiral', () => {
  it('starts in the middle and fills ring after ring', () => {
    expect(hexSpiral(0)).toEqual([]);
    const cells = hexSpiral(7);
    expect(cells[0]).toEqual([0, 0]);
    // The first ring: six neighbours at one cell, starting on the right.
    expect(cells[1]).toEqual([1, 0]);
    for (const [x, y] of cells.slice(1))
      expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    expect(Math.hypot(...hexSpiral(8)[7])).toBeGreaterThan(1.5);
  });
});

describe('MomentCloudWorld', () => {
  it('renders the cloud as one focusable widget with the lead in the pill', () => {
    const { stage, container } = renderCloud();
    expect(
      screen.getByRole('heading', { name: copy.cloud.heading }),
    ).toBeTruthy();
    expect(stage.getAttribute('aria-roledescription')).toBe(
      copy.cloud.roleDescription,
    );
    expect(stage.tabIndex).toBe(0);
    const hint = document.getElementById(
      stage.getAttribute('aria-describedby') ?? '',
    );
    expect(hint?.textContent).toBe(copy.cloud.hint);
    // The pill is decoration for sighted people; the announcer speaks.
    const pill = container.querySelector('.memory-cloud-pill');
    expect(pill?.getAttribute('aria-hidden')).toBe('true');
    expect(pill?.querySelector('.memory-cloud-pill-title')?.textContent).toBe(
      'By the lake',
    );
    expect(pill?.querySelector('.memory-cloud-pill-date')?.textContent).toBe(
      `${KICKER} · August 24, 2026`,
    );
    // Every bubble node of the pool is hidden from assistive technology.
    const bubbles = container.querySelectorAll('.memory-cloud-bubble');
    expect(bubbles.length).toBeGreaterThan(0);
    for (const bubble of bubbles)
      expect(bubble.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps every memory reachable as a list, lead first, then newest first', () => {
    renderCloud();
    const list = screen.getByRole('list', { name: copy.cloud.allMemories });
    const links = [...list.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual([
      fill(copy.cloud.memoryListItem, {
        title: 'By the lake',
        date: 'August 24, 2026',
      }),
      fill(copy.cloud.memoryListItem, {
        title: 'Picnic in the park',
        date: 'May 1, 2026',
      }),
      fill(copy.cloud.memoryListItem, {
        title: 'Thank you',
        date: 'February 14, 2025',
      }),
      fill(copy.cloud.memoryListItem, {
        title: 'Moved in together',
        date: 'June 1, 2024',
      }),
    ]);
    // The list is for screen readers; Tab goes to the stage only.
    for (const link of links) expect(link.tabIndex).toBe(-1);
    expect(links[0].getAttribute('href')).toBe('/story/memories/a');
  });

  it('wanders to the neighbouring bubble with the arrow keys and announces it', () => {
    const { stage } = renderCloud();
    stage.focus();
    expect(announcement()).toBe('');
    act(() => {
      fireEvent.keyDown(stage, { key: 'ArrowRight' });
    });
    expect(announcement()).toBe(
      fill(copy.cloud.centre, {
        title: 'Picnic in the park',
        date: 'May 1, 2026',
      }),
    );
    act(() => {
      fireEvent.keyDown(stage, { key: 'ArrowLeft' });
    });
    expect(announcement()).toBe(
      fill(copy.cloud.centre, {
        title: 'By the lake',
        date: 'August 24, 2026',
      }),
    );
  });

  it('grows the centre bubble into a dialog and returns focus on Escape', () => {
    const { stage } = renderCloud();
    stage.focus();
    act(() => {
      fireEvent.keyDown(stage, { key: 'Enter' });
    });
    const dialog = screen.getByRole('dialog', { name: 'By the lake' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = screen.getByRole('button', { name: copy.cloud.backToCloud });
    expect(document.activeElement).toBe(close);
    expect(dialog.textContent).toContain(KICKER);
    // The scrim closes on a tap but is never a focus stop.
    const scrim = dialog.querySelector<HTMLElement>('.memory-cloud-scrim');
    expect(scrim?.getAttribute('aria-hidden')).toBe('true');
    expect(scrim?.hasAttribute('tabindex')).toBe(false);
    // Reduced motion: the card is fully open at once.
    expect(Number(scrim?.style.opacity)).toBe(1);

    // Focus stays inside the dialog.
    const open = screen.getByRole('link', { name: copy.cloud.openInDiary });
    open.focus();
    fireEvent.keyDown(open, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(open);

    act(() => {
      fireEvent.keyDown(open, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(stage);
  });

  it('closes the card with its close button and opens the diary from it', () => {
    const onOpen = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    const { stage } = renderCloud(onOpen);
    act(() => {
      fireEvent.keyDown(stage, { key: 'ArrowRight' });
    });
    act(() => {
      fireEvent.keyDown(stage, { key: ' ' });
    });
    expect(
      screen.getByRole('dialog', { name: 'Picnic in the park' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: copy.cloud.openInDiary }));
    expect(onOpen.mock.calls[0].slice(1)).toEqual(['/story/memories/d', 'd']);
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: copy.cloud.backToCloud }),
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(stage);
  });

  it('lets the spring settle when motion is allowed instead of snapping', () => {
    motionAllowed();
    const { stage } = renderCloud();
    act(() => {
      fireEvent.keyDown(stage, { key: 'ArrowRight' });
    });
    // The magnetic settle runs in the frame loop; it announces on arrival.
    expect(announcement()).toBe('');
    act(() => {
      fireEvent.keyDown(stage, { key: 'Enter' });
    });
    // The card grows out of the bubble: it starts closed.
    const scrim = document.querySelector<HTMLElement>('.memory-cloud-scrim');
    expect(Number(scrim?.style.opacity)).toBe(0);
    expect(
      document
        .querySelector<HTMLElement>('.memory-cloud-card')
        ?.getAttribute('data-clip'),
    ).toBe('opening');
  });

  it('turns playful on a long press and calm again on the next tap', () => {
    motionAllowed();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { stage, container } = renderCloud();
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(stage.getAttribute('data-wiggle')).toBe('true');
    expect(
      container.querySelector('.memory-cloud-pill-title')?.textContent,
    ).toBe(copy.cloud.playTitle);
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(stage.getAttribute('data-wiggle')).toBe('true');

    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 10, clientY: 10 });
    act(() => {
      fireEvent.pointerUp(stage, { pointerId: 2, clientX: 10, clientY: 10 });
    });
    expect(stage.hasAttribute('data-wiggle')).toBe(false);
  });

  it('renders nothing without memories', () => {
    const { container } = render(
      <MemoryRouter>
        <MomentCloudWorld
          entries={[]}
          kicker={KICKER}
          loadMemoryImage={vi.fn()}
          onOpen={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('has no playful mode with reduced motion', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { stage } = renderCloud();
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(stage.hasAttribute('data-wiggle')).toBe(false);
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 10, clientY: 10 });
  });
});
