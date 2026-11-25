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
import type { MemoryAttachmentSummary } from '../../api/generated/models/MemoryAttachmentSummary';
import copy from '../../i18n/locales/memoryWorlds';
import { haptic } from '../../motion/haptics';
import { JAR_TIMING } from '../../motion/memoryJar';
import { entry } from './__fixtures__/stories';
import { JAR_DRAW_KEY, SLIP_COUNT_MIN } from './jarRules';
import { MemoryJarWorld } from './MemoryJarWorld';
import type { MemoryWorldEntry } from './model';

vi.mock('../../motion/haptics', () => ({ haptic: vi.fn() }));

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const jar = copy.jar;

const cover = {
  id: 'attachment-a',
  hasThumbnail: true,
  isSensitive: false,
  mediaType: 'IMAGE',
  position: 0,
} as MemoryAttachmentSummary;

// Without matchMedia the app's reduced-motion source reports reduced motion:
// every step shows its result at once, so the world is deterministic.
const entries = [
  entry('a', { isLead: true, kind: 'heart', title: 'Thank you' }),
  entry('b', { kind: 'photo', title: 'By the lake', cover }),
  entry('c', {
    kind: 'milestone',
    title: 'Moved in together',
    date: new Date('2021-03-01T00:00:00Z'),
  }),
];

function renderJar(list: MemoryWorldEntry[] = entries, onOpen = vi.fn()) {
  return render(
    <MemoryRouter>
      <MemoryJarWorld
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

/** Timers, the clock and frames under test control. */
function fakeClock() {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'Date',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function root() {
  const element = document.querySelector<HTMLElement>('.memory-jar-world');
  if (!element) throw new Error('no jar world');
  return element;
}

function jarGroup(count = 3) {
  return screen.getByRole('group', {
    name: fill(count === 1 ? jar.label_one : jar.label_other, { count }),
  });
}

function drawTag() {
  return screen.getByRole('button', { name: jar.tag.drawLabel });
}

function drawnTag() {
  return screen.getByRole('button', { name: jar.tag.drawnLabel });
}

/** The world's own live region (a loading photo may have one too). */
function announcement() {
  return root().querySelector(':scope > [role="status"]')?.textContent ?? '';
}

function note() {
  return document.querySelector('.memory-jar-note')?.textContent ?? null;
}

function hapticKinds() {
  return vi.mocked(haptic).mock.calls.map(([kind]) => kind);
}

function diaryLink(title: string) {
  return screen.getByRole('link', { name: fill(jar.diaryNamed, { title }) });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.mocked(haptic).mockClear();
});

describe('the Glas memory world', () => {
  it('shows the jar full of slips, with its tag as the named draw control', () => {
    renderJar();
    expect(screen.getByRole('heading', { name: jar.heading })).toBeTruthy();
    const group = jarGroup();
    expect(group.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(group.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toBe(jar.hint);
    expect(drawTag()).toBeTruthy();
    expect(root().dataset.phase).toBe('idle');
    expect(root().dataset.drawn).toBeUndefined();
    expect(group.querySelectorAll('.memory-jar-slip')).toHaveLength(
      SLIP_COUNT_MIN,
    );
    // The raised lettering counts from the oldest memory.
    expect(group.textContent).toContain(fill(jar.since, { year: 2021 }));
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('names a jar with one slip in the singular, and nothing without entries', () => {
    renderJar([entries[0]]);
    expect(jarGroup(1)).toBeTruthy();
    cleanup();
    const { container } = renderJar([]);
    expect(container.querySelector('.memory-jar-world')).toBeNull();
  });

  it('draws the lead at once by keyboard with reduced motion', () => {
    renderJar();
    // A button activated by the keyboard is a click with detail 0.
    fireEvent.click(drawTag());
    expect(announcement()).toBe(
      fill(jar.announce.drawn, { title: 'Thank you' }),
    );
    expect(hapticKinds()).toEqual(['commit']);
    expect(root().dataset.drawn).toBe('true');
    expect(root().dataset.phase).toBe('idle');
    expect(screen.queryByRole('dialog')).toBeNull();
    // The slip lies in the page: the memory and the diary tab open it.
    expect(diaryLink('Thank you')).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: fill(jar.open, { title: 'Thank you', date: '24. August 2026' }),
      }),
    ).toBeTruthy();
    expect(
      document.querySelector(
        '.memory-jar-drawn .memory-jar-paper > .memory-jar-sheet',
      )?.textContent,
    ).toContain(jar.kicker);
    // The panel copies of the slip are inert: two links, one back tag.
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: jar.backLabel })).toHaveLength(
      1,
    );
    expect(
      document.querySelectorAll('.memory-jar-sheet-copy[inert]'),
    ).toHaveLength(3);
    // The tag says today's slip is drawn; its key stays on this device.
    expect(drawnTag()).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(JAR_DRAW_KEY) ?? '{}').key,
    ).toBe('a');
  });

  it('draws with a tap on the jar', () => {
    renderJar();
    fireEvent.click(jarGroup());
    expect(diaryLink('Thank you')).toBeTruthy();
  });

  it('refuses a second slip today and explains why', () => {
    fakeClock();
    renderJar();
    fireEvent.click(drawTag());
    vi.mocked(haptic).mockClear();
    fireEvent.click(drawnTag());
    expect(hapticKinds()).toEqual(['refuse']);
    expect(announcement()).toBe(jar.drawnNote);
    expect(note()).toBe(jar.drawnNote);
    // The same slip stays out.
    expect(diaryLink('Thank you')).toBeTruthy();
    advance(5000);
    expect(note()).toBeNull();
    fireEvent.click(jarGroup());
    expect(hapticKinds()).toEqual(['refuse', 'refuse']);
  });

  it("keeps today's slip on this device until the next day", () => {
    fakeClock();
    vi.setSystemTime(new Date(2026, 10, 25, 9, 0));
    renderJar();
    fireEvent.click(drawTag());
    cleanup();

    vi.setSystemTime(new Date(2026, 10, 25, 22, 0));
    renderJar();
    expect(drawnTag()).toBeTruthy();
    expect(diaryLink('Thank you')).toBeTruthy();
    cleanup();

    vi.setSystemTime(new Date(2026, 10, 26, 7, 0));
    renderJar();
    expect(drawTag()).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('puts the slip back into the jar, and the next one is another', () => {
    renderJar();
    fireEvent.click(drawTag());
    const back = screen.getByRole('button', { name: jar.backLabel });
    back.focus();
    fireEvent.click(back);
    expect(announcement()).toBe(jar.announce.back);
    expect(screen.queryByRole('link')).toBeNull();
    expect(window.localStorage.getItem(JAR_DRAW_KEY)).toBeNull();
    // Keyboard focus comes back to the jar's tag.
    expect(document.activeElement).toBe(drawTag());
    expect(root().dataset.drawn).toBeUndefined();
    fireEvent.click(drawTag());
    expect(
      screen.queryByRole('link', {
        name: fill(jar.diaryNamed, { title: 'Thank you' }),
      }),
    ).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('draws at once when the phone is shaken with reduced motion', () => {
    fakeClock();
    vi.stubGlobal('DeviceMotionEvent', class {});
    renderJar();
    for (const [at, x] of [
      [0, 0],
      [150, 20],
      [150, -20],
      [150, 22],
    ]) {
      advance(at);
      act(() => {
        const event = new Event('devicemotion');
        Object.assign(event, {
          accelerationIncludingGravity: { x, y: 9.8, z: 0 },
        });
        window.dispatchEvent(event);
      });
    }
    expect(diaryLink('Thank you')).toBeTruthy();
    expect(announcement()).toBe(
      fill(jar.announce.drawn, { title: 'Thank you' }),
    );
  });

  it('opens the memory in the diary from the slip', () => {
    const onOpen = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    renderJar(entries, onOpen);
    fireEvent.click(drawTag());
    fireEvent.click(diaryLink('Thank you'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      '/story/memories/a',
      'a',
    );
  });
});

describe('the Glas memory world with motion', () => {
  it('rocks the jar on a press of the tag, pops the lid and unfolds the slip on a stage', () => {
    motionAllowed();
    fakeClock();
    renderJar();
    const tag = drawTag();
    tag.focus();
    fireEvent.click(tag);
    expect(hapticKinds()).toEqual(['press']);
    expect(root().dataset.phase).toBe('idle');
    // The tag is busy: another press does nothing.
    fireEvent.click(tag);
    expect(hapticKinds()).toEqual(['press']);

    advance(JAR_TIMING.hardShake);
    expect(root().dataset.phase).toBe('popping');
    expect(document.querySelector('.memory-jar-flying')).toBeTruthy();
    expect(tag.getAttribute('aria-disabled')).toBe('true');
    expect(
      JSON.parse(window.localStorage.getItem(JAR_DRAW_KEY) ?? '{}').key,
    ).toBe('a');
    advance(JAR_TIMING.popHaptic);
    expect(hapticKinds()).toEqual(['press', 'commit']);

    advance(JAR_TIMING.popToStage - JAR_TIMING.popHaptic);
    const stage = screen.getByRole('dialog', { name: jar.stage });
    expect(stage.getAttribute('aria-modal')).toBe('true');
    expect(root().dataset.phase).toBe('stage');
    expect(announcement()).toBe(
      fill(jar.announce.drawn, { title: 'Thank you' }),
    );
    const close = screen.getByRole('button', { name: jar.putDown });
    expect(document.activeElement).toBe(close);
    const paper = stage.querySelector<HTMLElement>('.memory-jar-paper');
    expect(paper?.dataset.state).toBe('unfolding');
    advance(JAR_TIMING.stageUnfolded);
    expect(paper?.dataset.state).toBe('open');
    expect(hapticKinds()).toEqual(['press', 'commit', 'threshold', 'moment']);

    // Tab stays inside the dialog.
    const focusables = [
      ...stage.querySelectorAll<HTMLElement>('a, button'),
    ].filter((el) => !el.closest('[inert]'));
    focusables.at(-1)?.focus();
    fireEvent.keyDown(stage, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);

    // Escape lays the slip down below the jar; focus returns to the tag.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(stage.dataset.step).toBe('closing');
    expect(
      document.querySelector('.memory-jar-scene')?.getAttribute('data-resize'),
    ).toBe('shrink');
    advance(JAR_TIMING.stageClose);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(root().dataset.phase).toBe('idle');
    expect(document.activeElement).toBe(drawnTag());
    expect(diaryLink('Thank you')).toBeTruthy();
  });

  it('opens the lid after four turns of the finger', () => {
    motionAllowed();
    fakeClock();
    renderJar();
    const group = jarGroup();
    const pointer = { pointerId: 3, pointerType: 'touch', button: 0 };
    fireEvent.pointerDown(group, { ...pointer, clientX: 100, clientY: 200 });
    for (const x of [106, 130, 110, 90, 110, 130, 110, 90])
      fireEvent.pointerMove(group, { ...pointer, clientX: x, clientY: 201 });
    expect(hapticKinds()).toEqual(['threshold', 'threshold', 'threshold']);
    expect(root().dataset.phase).toBe('idle');
    fireEvent.pointerMove(group, { ...pointer, clientX: 110, clientY: 201 });
    expect(hapticKinds()).toEqual([
      'threshold',
      'threshold',
      'threshold',
      'threshold',
    ]);
    expect(root().dataset.phase).toBe('popping');
    fireEvent.pointerUp(group, { ...pointer, clientX: 110, clientY: 201 });
    // The click that ends the drag is not a tap.
    fireEvent.click(group);
    expect(root().dataset.phase).toBe('popping');
  });

  it('lets a vertical move scroll the page instead of shaking', () => {
    motionAllowed();
    fakeClock();
    renderJar();
    const group = jarGroup();
    const pointer = { pointerId: 5, pointerType: 'touch', button: 0 };
    fireEvent.pointerDown(group, { ...pointer, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(group, { ...pointer, clientX: 102, clientY: 140 });
    for (const x of [130, 100, 130, 100, 130])
      fireEvent.pointerMove(group, { ...pointer, clientX: x, clientY: 150 });
    expect(hapticKinds()).toEqual([]);
  });

  it('rattles but refuses after today’s draw, and says so', () => {
    window.localStorage.setItem(
      JAR_DRAW_KEY,
      JSON.stringify({ day: '2026-11-25', key: 'b' }),
    );
    motionAllowed();
    fakeClock();
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0));
    renderJar();
    expect(diaryLink('By the lake')).toBeTruthy();
    fireEvent.click(drawnTag());
    advance(JAR_TIMING.hardShake);
    expect(root().dataset.phase).toBe('idle');
    expect(hapticKinds()).toEqual(['press', 'refuse']);
    expect(announcement()).toBe(jar.drawnNote);
    expect(diaryLink('By the lake')).toBeTruthy();
  });

  it('folds the slip back into the jar and drops it into the pile', () => {
    motionAllowed();
    fakeClock();
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0));
    window.localStorage.setItem(
      JAR_DRAW_KEY,
      JSON.stringify({ day: '2026-11-25', key: 'a' }),
    );
    renderJar();
    // jsdom has no layout: give the slip and the jar a box.
    const paper = document.querySelector<HTMLElement>(
      '.memory-jar-drawn .memory-jar-paper',
    );
    const jarEl = document.querySelector<HTMLElement>('.memory-jar-jar');
    if (!paper || !jarEl) throw new Error('no slip');
    paper.getBoundingClientRect = () =>
      ({ left: 20, top: 400, width: 300, height: 300 }) as DOMRect;
    jarEl.getBoundingClientRect = () =>
      ({ left: 60, top: 0, width: 148.8, height: 204.6 }) as DOMRect;
    const back = screen.getByRole('button', { name: jar.backLabel });
    back.focus();
    fireEvent.click(back);
    expect(root().dataset.phase).toBe('returning');
    advance(JAR_TIMING.fold + 50);
    expect(root().dataset.phase).toBe('carrying');
    advance(JAR_TIMING.carry + 50);
    expect(root().dataset.phase).toBe('dropping');
    expect(
      document.querySelector('.memory-jar-slip[data-drop="true"]'),
    ).toBeTruthy();
    advance(JAR_TIMING.dropDone);
    expect(root().dataset.phase).toBe('idle');
    expect(announcement()).toBe(jar.announce.back);
    expect(hapticKinds()).toEqual(['threshold', 'threshold', 'commit']);
    expect(window.localStorage.getItem(JAR_DRAW_KEY)).toBeNull();
    expect(document.activeElement).toBe(drawTag());
    expect(
      document.querySelector('.memory-jar-scene')?.getAttribute('data-resize'),
    ).toBe('grow');
  });

  it('pulls the slip up by its tag; a short pull springs back', () => {
    motionAllowed();
    fakeClock();
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0));
    window.localStorage.setItem(
      JAR_DRAW_KEY,
      JSON.stringify({ day: '2026-11-25', key: 'a' }),
    );
    renderJar();
    const paper = document.querySelector<HTMLElement>(
      '.memory-jar-drawn .memory-jar-paper',
    );
    const jarEl = document.querySelector<HTMLElement>('.memory-jar-jar');
    if (!paper || !jarEl) throw new Error('no slip');
    paper.getBoundingClientRect = () =>
      ({ left: 20, top: 400, width: 300, height: 300 }) as DOMRect;
    jarEl.getBoundingClientRect = () =>
      ({ left: 60, top: 0, width: 148.8, height: 204.6 }) as DOMRect;
    const back = screen.getByRole('button', { name: jar.backLabel });
    const pointer = { pointerId: 7, pointerType: 'touch', button: 0 };
    fireEvent.pointerDown(back, { ...pointer, clientX: 170, clientY: 400 });
    fireEvent.pointerMove(back, { ...pointer, clientX: 170, clientY: 360 });
    expect(root().dataset.phase).toBe('returning');
    fireEvent.pointerUp(back, { ...pointer, clientX: 170, clientY: 360 });
    advance(JAR_TIMING.springBack + 50);
    expect(root().dataset.phase).toBe('idle');
    expect(diaryLink('Thank you')).toBeTruthy();

    // Pulled far enough, it folds on and goes in by itself.
    fireEvent.pointerDown(back, { ...pointer, clientX: 170, clientY: 400 });
    fireEvent.pointerMove(back, { ...pointer, clientX: 170, clientY: 100 });
    fireEvent.pointerUp(back, { ...pointer, clientX: 170, clientY: 100 });
    fireEvent.click(back);
    advance(JAR_TIMING.fold + JAR_TIMING.carry + JAR_TIMING.dropDone + 100);
    expect(root().dataset.phase).toBe('idle');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('pauses the candle while the jar is not seen', () => {
    renderJar();
    expect(root().dataset.ambient).toBe('on');
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(root().dataset.ambient).toBe('paused');
    delete (document as { visibilityState?: string }).visibilityState;
  });

  it('pops the lid when the phone is shaken while the jar is seen', () => {
    motionAllowed();
    fakeClock();
    vi.stubGlobal('DeviceMotionEvent', class {});
    renderJar();
    const shake = (x: number) =>
      act(() => {
        const event = new Event('devicemotion');
        Object.assign(event, {
          accelerationIncludingGravity: { x, y: 9.8, z: 0 },
        });
        window.dispatchEvent(event);
      });
    shake(0);
    advance(150);
    shake(20);
    advance(150);
    shake(-20);
    advance(150);
    shake(22);
    advance(JAR_TIMING.hardShake);
    expect(root().dataset.phase).toBe('popping');
    // A shake by itself gives no press haptic.
    expect(hapticKinds()).not.toContain('press');
  });
});
