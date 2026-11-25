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
import rediscovery from '../../i18n/locales/rediscovery';
import { haptic } from '../../motion/haptics';
import { entry } from './__fixtures__/stories';
import type { MemoryWorldEntry } from './model';
import { envelopeDesigns, POST_TIMING, PostWorld, sideOf } from './PostWorld';

vi.mock('../../motion/haptics', () => ({ haptic: vi.fn() }));

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const post = copy.post;
const SUMMER_2026 = fill(rediscovery.season.line, {
  season: rediscovery.season.summer,
  year: 2026,
});

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
  entry('c', { kind: 'milestone', title: 'Moved in together' }),
];

function renderPost(list = entries, onOpen = vi.fn()) {
  return render(
    <MemoryRouter>
      <PostWorld
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

function announcement() {
  return screen.getByRole('status').textContent ?? '';
}

function scene() {
  const element = document.querySelector<HTMLElement>('.memory-post-scene');
  if (!element) throw new Error('no scene');
  return element;
}

function mailbox() {
  return screen.getByRole('button', { name: post.openBox });
}

function flap(name = 'Lea') {
  return screen.getByRole('button', {
    name: fill(post.openEnvelope, { name }),
  });
}

function shoebox() {
  return screen.getByRole('button', { name: post.file });
}

function openLink(title: string) {
  return screen.getByRole('link', { name: fill(post.openNamed, { title }) });
}

function faces() {
  const front = document.querySelector('.memory-post-front');
  const back = document.querySelector('.memory-post-back');
  if (!front || !back) throw new Error('no card');
  return { front, back };
}

function hapticKinds() {
  return vi.mocked(haptic).mock.calls.map(([kind]) => kind);
}

/** Opens the mailbox and the envelope with the keyboard (click detail 0). */
function openLetter(name = 'Lea') {
  fireEvent.click(mailbox());
  fireEvent.click(flap(name));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.mocked(haptic).mockClear();
});

describe('envelopeDesigns', () => {
  const many: MemoryWorldEntry[] = Array.from({ length: 12 }, (_, index) =>
    entry(`m${index}`, {
      kind: (['photo', 'heart', 'milestone', 'words'] as const)[index % 4],
      cover: index % 4 === 0 ? cover : undefined,
      date: new Date(Date.UTC(2025, index, 10)),
    }),
  );

  it('gives every memory the same envelope and never repeats one next to each other', () => {
    const designs = envelopeDesigns(many);
    expect(envelopeDesigns(many)).toEqual(designs);
    expect(designs).toHaveLength(many.length);
    for (let index = 1; index < designs.length; index += 1)
      expect(designs[index]).not.toBe(designs[index - 1]);
    // The delivery wraps around: the last letter differs from the first.
    expect(designs[designs.length - 1]).not.toBe(designs[0]);
  });

  it('chooses a design that suits the kind of memory', () => {
    const [heart] = envelopeDesigns([entry('h', { kind: 'heart' })]);
    expect(['rose', 'sage', 'midnight']).toContain(heart);
    const [milestone] = envelopeDesigns([entry('s', { kind: 'milestone' })]);
    expect(['telegram', 'airmail', 'midnight']).toContain(milestone);
  });
});

describe('sideOf', () => {
  it('tells the picture side from the writing side for any turn', () => {
    expect(sideOf(0)).toBe(0);
    expect(sideOf(170)).toBe(1);
    expect(sideOf(-180)).toBe(1);
    expect(sideOf(360)).toBe(0);
    expect(sideOf(-540)).toBe(1);
  });
});

describe('PostWorld', () => {
  it('renders nothing without memories', () => {
    const { container } = renderPost([]);
    expect(container.innerHTML).toBe('');
  });

  it('shows the mailbox with its flag up and post waiting', () => {
    renderPost();
    expect(
      screen.getByRole('heading', { level: 2, name: post.heading }),
    ).toBeTruthy();
    expect(mailbox().hasAttribute('disabled')).toBe(false);
    expect(shoebox().hasAttribute('disabled')).toBe(true);
    expect(
      document.querySelector('.memory-post-flag')?.getAttribute('data-up'),
    ).toBe('true');
    expect(scene().dataset.phase).toBe('waiting');
    // No letter is out yet.
    expect(document.querySelector('.memory-post-mail')).toBeNull();
    // The idle flutter runs only while the mailbox is seen.
    expect(
      document.querySelector<HTMLElement>('.memory-post-world')?.dataset
        .ambient,
    ).toBe('on');
  });

  it('opens a letter by keyboard and lets focus follow the post', () => {
    renderPost();
    fireEvent.click(mailbox());
    // Reduced motion: the envelope is there at once, without a flight.
    expect(scene().dataset.phase).toBe('envelope');
    expect(
      document.querySelector('.memory-post-door')?.getAttribute('data-motion'),
    ).toBe('still');
    expect(
      document.querySelector('.memory-post-mail')?.hasAttribute('data-flying'),
    ).toBe(false);
    expect(announcement()).toBe(post.announce.waiting);
    expect(document.activeElement).toBe(flap());
    expect(
      document.querySelector('.memory-post-flag')?.getAttribute('data-up'),
    ).toBe('false');

    fireEvent.click(flap());
    expect(scene().dataset.phase).toBe('card');
    expect(announcement()).toBe(
      fill(post.announce.card, { title: 'Thank you' }),
    );
    const link = openLink('Thank you');
    expect(document.activeElement).toBe(link);
    expect(shoebox().hasAttribute('disabled')).toBe(false);
    expect(hapticKinds()).toEqual(['press', 'press']);
  });

  it('shows the memory on both sides of the postcard and turns it by keyboard', () => {
    renderPost();
    openLetter();
    const { front, back } = faces();
    expect(front.hasAttribute('aria-hidden')).toBe(false);
    expect(back.getAttribute('aria-hidden')).toBe('true');
    expect(front.textContent).toContain('Thank you');
    expect(front.textContent).toContain(
      fill(post.greeting, { season: SUMMER_2026 }),
    );

    fireEvent.click(screen.getByRole('button', { name: post.turnOver }));
    expect(front.getAttribute('aria-hidden')).toBe('true');
    expect(back.hasAttribute('aria-hidden')).toBe(false);
    expect(back.textContent).toContain('Two years ago today');
    expect(back.textContent).toContain('Thank you');
    expect(back.textContent).toContain(fill(post.sign, { name: 'Lea' }));
    expect(back.querySelector('time')?.getAttribute('dateTime')).toBe(
      '2026-08-24',
    );
    // A heart moment is quoted.
    expect(
      back
        .querySelector('.memory-post-message-text')
        ?.getAttribute('data-quote'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: post.turnBack }));
    expect(front.hasAttribute('aria-hidden')).toBe(false);
  });

  it('opens the memory in the diary from the paper tag', () => {
    const onOpen = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    renderPost(entries, onOpen);
    openLetter();
    fireEvent.click(openLink('Thank you'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      '/story/memories/a',
      'a',
    );
  });

  it('puts the read card into the shoebox and the next letter arrives', () => {
    renderPost();
    openLetter();
    fireEvent.click(shoebox());
    expect(announcement()).toBe(post.announce.filedNew);
    expect(scene().dataset.phase).toBe('waiting');
    expect(document.activeElement).toBe(mailbox());
    // Two decoration cards plus the filed one.
    expect(document.querySelectorAll('.memory-post-boxed')).toHaveLength(3);
    expect(
      document.querySelector('.memory-post-flag')?.getAttribute('data-up'),
    ).toBe('true');

    // The next memory comes in its own envelope.
    openLetter();
    expect(openLink('By the lake')).toBeTruthy();
    fireEvent.click(shoebox());
    openLetter();
    expect(openLink('Moved in together')).toBeTruthy();
    fireEvent.click(shoebox());
    // The delivery starts over with the first memory.
    openLetter();
    expect(openLink('Thank you')).toBeTruthy();
  });

  it('turns the card with a sideways swipe and springs a short carry back', () => {
    renderPost();
    openLetter();
    const card = document.querySelector<HTMLElement>('.memory-post-turn');
    if (!card) throw new Error('no card');
    const pointer = { pointerId: 4, pointerType: 'touch', button: 0 };
    fireEvent.pointerDown(card, { ...pointer, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(card, { ...pointer, clientX: 140, clientY: 102 });
    expect(card.dataset.turning).toBe('true');
    fireEvent.pointerMove(card, { ...pointer, clientX: 220, clientY: 104 });
    fireEvent.pointerUp(card, { ...pointer, clientX: 220, clientY: 104 });
    expect(card.dataset.turning).toBeUndefined();
    expect(card.dataset.side).toBe('back');
    expect(hapticKinds()).toContain('commit');
    // The click that follows the swipe does not turn the card again.
    fireEvent.click(card);
    expect(card.dataset.side).toBe('back');

    // A vertical drag that ends away from the shoebox springs back.
    const wrapper = card.closest<HTMLElement>('.memory-post-card');
    fireEvent.pointerDown(card, { ...pointer, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(card, { ...pointer, clientX: 102, clientY: 140 });
    expect(wrapper?.dataset.carry).toBe('drag');
    fireEvent.pointerUp(card, { ...pointer, clientX: 102, clientY: 140 });
    expect(wrapper?.dataset.carry).toBe('spring');
    expect(scene().dataset.phase).toBe('card');
  });

  it('runs the post on its clock when motion is allowed', () => {
    motionAllowed();
    vi.useFakeTimers();
    renderPost();
    const flag = () =>
      document.querySelector('.memory-post-flag')?.getAttribute('data-up');
    expect(flag()).toBe('false');
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.flagFirst);
    });
    expect(flag()).toBe('true');

    // Pull the door down past its latch and let go: it falls open.
    const door = mailbox();
    const pointer = { pointerId: 1, pointerType: 'touch', button: 0 };
    fireEvent.pointerDown(door, { ...pointer, clientX: 50, clientY: 100 });
    fireEvent.pointerMove(door, { ...pointer, clientX: 50, clientY: 170 });
    expect(door.dataset.dragging).toBe('true');
    fireEvent.pointerUp(door, { ...pointer, clientX: 50, clientY: 170 });
    expect(scene().dataset.phase).toBe('opening');
    expect(
      document.querySelector('.memory-post-door')?.getAttribute('data-motion'),
    ).toBe('fall');
    expect(
      document.querySelector('.memory-post-mail')?.getAttribute('data-flying'),
    ).toBe('true');
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.mailDelay + POST_TIMING.mailFlight);
    });
    expect(scene().dataset.phase).toBe('envelope');
    expect(announcement()).toBe(post.announce.arrived);
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.doorCloseDelay);
    });
    expect(
      document.querySelector('.memory-post-door')?.getAttribute('data-motion'),
    ).toBe('close');

    // Lift the flap past its latch: the card is pulled out and settles.
    const lid = flap();
    fireEvent.pointerDown(lid, { ...pointer, clientX: 50, clientY: 300 });
    fireEvent.pointerMove(lid, { ...pointer, clientX: 50, clientY: 220 });
    fireEvent.pointerUp(lid, { ...pointer, clientX: 50, clientY: 220 });
    expect(scene().dataset.phase).toBe('unsealing');
    const card = document.querySelector<HTMLElement>('.memory-post-card');
    if (!card) throw new Error('no card');
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.flapOpen);
    });
    expect(card.dataset.at).toBe('pulled');
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.cardPull + POST_TIMING.cardSettle);
    });
    expect(card.dataset.at).toBe('rest');
    expect(scene().dataset.phase).toBe('card');
    expect(announcement()).toBe(
      fill(post.announce.card, { title: 'Thank you' }),
    );
    // The card hints once that it can be turned.
    expect(
      document.querySelector<HTMLElement>('.memory-post-turn')?.dataset.hint,
    ).toBe('true');

    // Filing: the card is lifted above the box, sinks in, the next letter
    // drops through the slot and the flag goes up.
    Object.defineProperty(card, 'offsetWidth', { value: 300 });
    Object.defineProperty(card, 'offsetHeight', { value: 200 });
    fireEvent.click(shoebox());
    expect(scene().dataset.phase).toBe('filing');
    expect(card.dataset.carry).toBe('lift');
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.fileLift);
    });
    expect(card.dataset.carry).toBe('sink');
    expect(scene().dataset.sink).toBe('true');
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.fileSink);
    });
    expect(scene().dataset.phase).toBe('delivering');
    expect(announcement()).toBe(post.announce.filed);
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.deliveryPause);
    });
    expect(document.querySelector('.memory-post-slot-letter')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(POST_TIMING.slotLetter + POST_TIMING.flagRaise);
    });
    expect(scene().dataset.phase).toBe('waiting');
    expect(flag()).toBe('true');
    expect(announcement()).toBe(post.announce.newPost);
    expect(hapticKinds()).toEqual(
      expect.arrayContaining([
        'press',
        'threshold',
        'commit',
        'moment',
        'success',
      ]),
    );
  });

  it('lets the door and the flap fall back when they are not pulled far enough', () => {
    vi.useFakeTimers();
    renderPost();
    const door = mailbox();
    const pointer = { pointerId: 2, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(door, { ...pointer, clientX: 50, clientY: 100 });
    fireEvent.pointerMove(door, { ...pointer, clientX: 50, clientY: 130 });
    fireEvent.pointerUp(door, { ...pointer, clientX: 50, clientY: 130 });
    expect(scene().dataset.phase).toBe('waiting');
    expect(door.dataset.motion).toBe('close');
    // The click that follows the drag does not open the mailbox.
    fireEvent.click(door);
    expect(scene().dataset.phase).toBe('waiting');
    act(() => {
      vi.advanceTimersByTime(100);
    });

    fireEvent.click(mailbox());
    const lid = flap();
    fireEvent.pointerDown(lid, { ...pointer, clientX: 50, clientY: 300 });
    fireEvent.pointerMove(lid, { ...pointer, clientX: 50, clientY: 270 });
    fireEvent.pointerUp(lid, { ...pointer, clientX: 50, clientY: 270 });
    expect(scene().dataset.phase).toBe('envelope');
    expect(lid.hasAttribute('data-open')).toBe(false);
  });
});
