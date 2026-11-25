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
import type { MemoryAttachmentSummary } from '../../api/generated/models/MemoryAttachmentSummary';
import copy from '../../i18n/locales/memoryWorlds';
import { haptic } from '../../motion/haptics';
import { entry } from './__fixtures__/stories';
import {
  FRIDGE_BATCH,
  FRIDGE_DRAG_BOUNDS,
  FRIDGE_KEY_STEP,
  FridgeDoorWorld,
  layoutDoor,
  movedBy,
} from './FridgeDoorWorld';
import type { MemoryWorldEntry } from './model';

vi.mock('../../motion/haptics', () => ({ haptic: vi.fn() }));

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const fridge = copy.fridge;

const cover = {
  id: 'attachment-a',
  hasThumbnail: true,
  isSensitive: false,
  mediaType: 'IMAGE',
  position: 0,
} as MemoryAttachmentSummary;

// Without matchMedia the app's reduced-motion source reports reduced motion:
// nothing is pinned or flies, so the door is ready at once.
const entries = [
  entry('a', { kind: 'photo', title: 'By the lake', cover }),
  entry('b', {
    isLead: true,
    kind: 'heart',
    emotion: 'LOVED',
    title: 'Thank you',
  }),
  entry('c', { kind: 'milestone', title: 'Moved in together' }),
  entry('d', { title: 'Picnic in the park' }),
];

function many(count: number): MemoryWorldEntry[] {
  return Array.from({ length: count }, (_, index) =>
    entry(`m${index}`, { title: `Memory ${index}`, isLead: index === 0 }),
  );
}

function renderDoor(list = entries, onOpen = vi.fn()) {
  return render(
    <MemoryRouter>
      <FridgeDoorWorld
        entries={list}
        kicker="Two years ago today"
        loadMemoryImage={() => new Promise(() => {})}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
}

function motionAllowed() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function door(count = 4) {
  return screen.getByRole('group', {
    name: fill(fridge.label_other, { count }),
  });
}

function note(name: string) {
  return within(door()).getByRole('button', { name });
}

function slotOf(button: HTMLElement) {
  const slot = button.closest<HTMLElement>('.memory-fridge-slot');
  if (!slot) throw new Error('note without slot');
  return slot;
}

/** A slot's resting place as fractions of the door. */
function placeOf(button: HTMLElement) {
  const slot = slotOf(button);
  return {
    x: Number.parseFloat(slot.style.left) / 100,
    y: Number.parseFloat(slot.style.top) / 100,
  };
}

function announcement() {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function hapticKinds() {
  return vi.mocked(haptic).mock.calls.map(([kind]) => kind);
}

const HEART = fill(fridge.item.heartBy, {
  title: 'Thank you',
  name: 'Lea',
  date: '24. August 2026',
});
const WORDS = fill(fridge.item.words, {
  title: 'Picnic in the park',
  date: '24. August 2026',
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.mocked(haptic).mockClear();
});

describe('layoutDoor', () => {
  it('places the same notes the same way and keeps them on the door', () => {
    const first = layoutDoor(entries);
    expect(layoutDoor(entries)).toEqual(first);
    expect(first.spots).toHaveLength(4);
    for (const spot of first.spots) {
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(1);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.y).toBeLessThan(0.8);
    }
    // Every note gets its own pinning rank, top to bottom.
    expect(first.spots.map((spot) => spot.rank).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('movedBy', () => {
  it('moves by a step and stops at the edge of the door', () => {
    expect(movedBy({ x: 0.5, y: 0.5 }, 'right', 0.1)).toEqual({
      x: 0.6,
      y: 0.5,
    });
    expect(movedBy({ x: 0.5, y: 0.12 }, 'up', 0.1)).toEqual({
      x: 0.5,
      y: FRIDGE_DRAG_BOUNDS.minY,
    });
    expect(movedBy({ x: 0.88, y: 0.5 }, 'right', 0.1).x).toBe(
      FRIDGE_DRAG_BOUNDS.maxX,
    );
  });
});

describe('FridgeDoorWorld', () => {
  it('hangs every memory on the door as a labelled note', () => {
    renderDoor();
    expect(screen.getByRole('heading', { name: fridge.heading })).toBeTruthy();
    const group = door();
    expect(group.getAttribute('aria-roledescription')).toBe(
      fridge.roleDescription,
    );
    expect(group.dataset.phase).toBe('idle');
    const names = within(group)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual([
      HEART,
      fill(fridge.item.photo, {
        title: 'By the lake',
        date: '24. August 2026',
      }),
      fill(fridge.item.milestone, {
        title: 'Moved in together',
        date: '24. August 2026',
      }),
      WORDS,
    ]);
    // Everything fits on the door: no notepad for new notes.
    expect(
      within(group).queryByRole('button', { name: fridge.pad }),
    ).toBeNull();
    // Each kind has its own holder; the letter magnets stay decorative.
    expect(
      group.querySelectorAll('.memory-fridge-magnet[data-shape="round"]'),
    ).toHaveLength(1);
    expect(
      group.querySelectorAll('.memory-fridge-magnet[data-shape="heart"]'),
    ).toHaveLength(1);
    expect(
      group.querySelectorAll('.memory-fridge-magnet[data-shape="star"]'),
    ).toHaveLength(1);
    expect(group.querySelectorAll('.memory-fridge-tape')).toHaveLength(1);
    const letters = group.querySelectorAll('.memory-fridge-letter');
    expect(letters).toHaveLength(7);
    for (const letter of letters)
      expect(letter.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps every memory reachable as a plain list, the lead first', () => {
    const onOpen = vi.fn();
    renderDoor(entries, onOpen);
    const list = screen.getByRole('list', { name: fridge.allMemories });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      fill(fridge.memoryListItem, {
        title: 'Thank you',
        date: '24. August 2026',
      }),
      fill(fridge.memoryListItem, {
        title: 'By the lake',
        date: '24. August 2026',
      }),
      fill(fridge.memoryListItem, {
        title: 'Moved in together',
        date: '24. August 2026',
      }),
      fill(fridge.memoryListItem, {
        title: 'Picnic in the park',
        date: '24. August 2026',
      }),
    ]);
    fireEvent.click(links[1]);
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      '/story/memories/a',
      'a',
    );
  });

  it('opens a note as a dialog and returns focus to it on Escape', () => {
    const onOpen = vi.fn();
    renderDoor(entries, onOpen);
    const heart = note(HEART);
    heart.focus();
    fireEvent.click(heart);
    const dialog = screen.getByRole('dialog', { name: 'Thank you' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The lead carries its kicker; the close button takes the focus.
    expect(within(dialog).getByText('Two years ago today')).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: fridge.backToDoor }),
    );
    // The paper is off the door while its card is open.
    expect(slotOf(heart).dataset.open).toBe('open');
    fireEvent.click(
      within(dialog).getByRole('link', { name: fridge.openInDiary }),
    );
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      '/story/memories/b',
      'b',
    );

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(note(HEART));
    expect(slotOf(note(HEART)).dataset.open).toBeUndefined();
    expect(hapticKinds()).toEqual(['press', 'threshold']);
  });

  it('closes the card with its close button and keeps Tab inside it', () => {
    renderDoor();
    fireEvent.click(note(WORDS));
    const dialog = screen.getByRole('dialog', { name: 'Picnic in the park' });
    const close = within(dialog).getByRole('button', {
      name: fridge.backToDoor,
    });
    const link = within(dialog).getByRole('link', { name: fridge.openInDiary });
    link.focus();
    fireEvent.keyDown(link, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(link);
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(note(WORDS));
  });

  it('moves the focused note with the arrow keys and announces it', () => {
    renderDoor();
    const words = note(WORDS);
    const start = placeOf(words);
    fireEvent.keyDown(words, { key: 'ArrowLeft' });
    expect(placeOf(words).x).toBeCloseTo(start.x - FRIDGE_KEY_STEP, 4);
    expect(placeOf(words).y).toBeCloseTo(start.y, 4);
    expect(announcement()).toBe(
      fill(fridge.moved.left, { title: 'Picnic in the park' }),
    );
    // Shift takes the larger step.
    fireEvent.keyDown(words, { key: 'ArrowDown', shiftKey: true });
    expect(placeOf(words).y).toBeGreaterThan(start.y + FRIDGE_KEY_STEP);
    expect(announcement()).toBe(
      fill(fridge.moved.down, { title: 'Picnic in the park' }),
    );
    // A moved note comes to the front and is not opened by the keys.
    expect(Number(slotOf(words).style.zIndex)).toBeGreaterThan(100);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hapticKinds()).toEqual(['threshold', 'threshold']);

    for (let step = 0; step < 30; step += 1)
      fireEvent.keyDown(words, { key: 'ArrowUp' });
    expect(placeOf(words).y).toBeCloseTo(FRIDGE_DRAG_BOUNDS.minY, 4);
    expect(announcement()).toBe(
      fill(fridge.edge, { title: 'Picnic in the park' }),
    );
  });

  it('moves a note with the pointer and does not open it on release', () => {
    renderDoor();
    const group = door();
    vi.spyOn(group, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 390,
      width: 300,
      height: 390,
      toJSON: () => ({}),
    });
    const words = note(WORDS);
    const start = placeOf(words);
    const pointer = { pointerId: 7, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(words, { ...pointer, clientX: 100, clientY: 100 });
    // A tiny movement stays a tap.
    fireEvent.pointerMove(words, { ...pointer, clientX: 102, clientY: 101 });
    expect(slotOf(words).dataset.dragging).toBeUndefined();
    fireEvent.pointerMove(words, { ...pointer, clientX: 130, clientY: 139 });
    expect(slotOf(words).dataset.dragging).toBe('true');
    fireEvent.pointerUp(words, { ...pointer, clientX: 130, clientY: 139 });
    fireEvent.click(words);

    expect(slotOf(words).dataset.dragging).toBeUndefined();
    expect(placeOf(words).x).toBeCloseTo(start.x + 30 / 300, 3);
    expect(placeOf(words).y).toBeCloseTo(start.y + 39 / 390, 3);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The magnet lets go of the door and snaps back onto it.
    expect(hapticKinds()).toEqual(['threshold', 'threshold']);
  });

  it('moves the letter magnets with the pointer too', () => {
    renderDoor();
    const group = door();
    vi.spyOn(group, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 390,
      width: 300,
      height: 390,
      toJSON: () => ({}),
    });
    const letter = group.querySelector<HTMLElement>(
      '.memory-fridge-letter[data-glyph="heart"]',
    );
    if (!letter) throw new Error('heart letter missing');
    const before = Number.parseFloat(letter.style.left);
    const pointer = { pointerId: 3, pointerType: 'pen', button: 0 };
    fireEvent.pointerDown(letter, { ...pointer, clientX: 50, clientY: 300 });
    fireEvent.pointerMove(letter, { ...pointer, clientX: 20, clientY: 300 });
    fireEvent.pointerUp(letter, { ...pointer, clientX: 20, clientY: 300 });
    expect(Number.parseFloat(letter.style.left)).toBeCloseTo(before - 10, 2);
  });

  it('hangs up the next notes from the notepad at once with reduced motion', () => {
    renderDoor(many(FRIDGE_BATCH + 2));
    const group = door(FRIDGE_BATCH);
    expect(within(group).getAllByRole('button')).toHaveLength(FRIDGE_BATCH + 1);
    const first = within(group).getByRole('button', {
      name: fill(fridge.item.words, {
        title: 'Memory 0',
        date: '24. August 2026',
      }),
    });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    fireEvent.click(within(group).getByRole('button', { name: fridge.pad }));
    expect(group.dataset.phase).toBe('idle');
    // The next six wrap around the selection; moved places start over.
    const titles = [...group.querySelectorAll('.memory-fridge-item')].map(
      (button) => button.getAttribute('aria-label')?.split(',')[0],
    );
    expect(titles).toEqual(
      [6, 7, 0, 1, 2, 3].map(
        (index) =>
          fill(fridge.item.words, { title: `Memory ${index}`, date: '' }).split(
            ',',
          )[0],
      ),
    );
    expect(announcement()).toBe(
      fill(fridge.swapped_other, { count: FRIDGE_BATCH }),
    );
    expect(hapticKinds()).toEqual(['threshold', 'commit']);
    // The whole selection stays in the list.
    expect(
      within(
        screen.getByRole('list', { name: fridge.allMemories }),
      ).getAllByRole('link'),
    ).toHaveLength(FRIDGE_BATCH + 2);
  });

  it('pins the notes up and lets them fall off when motion is welcome', () => {
    vi.useFakeTimers();
    motionAllowed();
    renderDoor(many(FRIDGE_BATCH + 1));
    const group = door(FRIDGE_BATCH);
    expect(group.dataset.phase).toBe('pinning');
    // While the notes are pinned up nothing opens.
    fireEvent.click(within(group).getAllByRole('button')[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(group.dataset.phase).toBe('idle');

    fireEvent.click(within(group).getByRole('button', { name: fridge.pad }));
    expect(group.dataset.phase).toBe('falling');
    expect(announcement()).toBe('');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(group.dataset.phase).toBe('pinning');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(group.dataset.phase).toBe('idle');
    expect(announcement()).toBe(
      fill(fridge.swapped_other, { count: FRIDGE_BATCH }),
    );
    // The pad tears, then each magnet lands with a light click.
    expect(hapticKinds()).toEqual([
      'commit',
      ...Array.from({ length: FRIDGE_BATCH }, () => 'threshold'),
    ]);
  });

  it('renders nothing without memories', () => {
    const { container } = renderDoor([]);
    expect(container.querySelector('.memory-fridge-world')).toBeNull();
  });
});
