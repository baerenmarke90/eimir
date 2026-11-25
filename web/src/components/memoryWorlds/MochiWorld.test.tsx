// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import copy from '../../i18n/locales/memoryWorlds';
import { haptic } from '../../motion/haptics';
import { entry } from './__fixtures__/stories';
import { MOCHI_ACTIONS, MochiWorld } from './MochiWorld';

vi.mock('../../motion/haptics', () => ({ haptic: vi.fn() }));

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const mochi = copy.mochi;

// Without matchMedia the app's reduced-motion source reports reduced motion:
// an action shows its balloon at once, so the world is deterministic.
const entries = [
  entry('b', { kind: 'heart', emotion: 'LOVED', title: 'Thank you' }),
  entry('a', { isLead: true, title: 'By the lake' }),
  entry('c', { kind: 'milestone', title: 'Moved in together' }),
];

function renderMochis(onOpen = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <MochiWorld
        entries={entries}
        kicker="Two years ago today"
        loadMemoryImage={vi.fn()}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
  const scene = screen.getByRole('group', { name: mochi.label });
  return { ...view, scene, onOpen };
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
  return document.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function actionButton(kind: keyof typeof mochi.action) {
  return within(screen.getByRole('group', { name: mochi.actions })).getByRole(
    'button',
    { name: mochi.action[kind] },
  );
}

function rising(kind: keyof typeof mochi.acted, title: string) {
  return `${mochi.acted[kind]} ${fill(mochi.rises, {
    title,
    date: '24. August 2026',
  })}`;
}

function openName(title: string) {
  return fill(mochi.open, { title, date: '24. August 2026' });
}

function hapticKinds() {
  return vi.mocked(haptic).mock.calls.map(([kind]) => kind);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.mocked(haptic).mockClear();
});

describe('MochiWorld', () => {
  it('shows the two mochis on their meadow with a named button per action', () => {
    const { scene } = renderMochis();
    expect(screen.getByRole('heading', { name: mochi.heading })).toBeTruthy();
    expect(scene.getAttribute('aria-roledescription')).toBe(
      mochi.roleDescription,
    );
    expect(
      document.getElementById(scene.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toBe(mochi.description);
    expect(scene.querySelectorAll('.memory-mochi')).toHaveLength(2);
    expect(
      [...scene.querySelectorAll('.memory-mochi')].map((node) =>
        node.getAttribute('data-person'),
      ),
    ).toEqual(['own', 'partner']);
    const buttons = within(
      screen.getByRole('group', { name: mochi.actions }),
    ).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(
      MOCHI_ACTIONS.map((item) => mochi.action[item.kind]),
    );
    // No balloon before the first action.
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('lets every action raise a heart balloon with the next memory, the lead first', () => {
    renderMochis();
    const titles = [
      'By the lake',
      'Thank you',
      'Moved in together',
      'By the lake',
      'Thank you',
    ];
    MOCHI_ACTIONS.forEach((item, index) => {
      fireEvent.click(actionButton(item.kind));
      expect(announcement()).toBe(rising(item.kind, titles[index]));
      expect(
        screen.getByRole('link', { name: openName(titles[index]) }),
      ).toBeTruthy();
    });
    expect(hapticKinds()).toEqual(MOCHI_ACTIONS.map(() => 'affection'));
  });

  it('runs the actions from the keyboard', async () => {
    const user = userEvent.setup();
    renderMochis();
    await user.tab();
    expect(document.activeElement).toBe(actionButton('cuddle'));
    await user.keyboard('{Enter}');
    expect(announcement()).toBe(rising('cuddle', 'By the lake'));
    // The focus stays in the row; the balloon comes before it.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: openName('By the lake') }),
    );
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(actionButton('kiss'));
    await user.keyboard(' ');
    expect(announcement()).toBe(rising('kiss', 'Thank you'));
  });

  it('lets earlier memories float into the sky, where they stay openable', () => {
    const { onOpen } = renderMochis();
    fireEvent.click(actionButton('cuddle'));
    fireEvent.click(actionButton('hug'));
    const sky = screen.getByRole('list', { name: mochi.sky });
    const skyLink = within(sky).getByRole('link', {
      name: openName('By the lake'),
    });
    // The balloon held now is not in the sky.
    expect(
      within(sky).queryByRole('link', { name: openName('Thank you') }),
    ).toBeNull();
    fireEvent.click(skyLink);
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.anything(),
      '/story/memories/a',
      'a',
    );
    fireEvent.click(screen.getByRole('link', { name: openName('Thank you') }));
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.anything(),
      '/story/memories/b',
      'b',
    );
  });

  it('keeps each memory once in the sky, never the one held now', () => {
    renderMochis();
    for (const kind of [
      'cuddle',
      'kiss',
      'hug',
      'laugh',
      'dance',
      'cuddle',
    ] as const)
      fireEvent.click(actionButton(kind));
    const sky = screen.getByRole('list', { name: mochi.sky });
    expect(
      within(sky)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
      // Held now: the third memory again; the sky keeps the other two once.
    ).toEqual([openName('By the lake'), openName('Thank you')]);
  });

  it('falls asleep after a while without play and wakes up with the next action', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { scene } = renderMochis();
    act(() => {
      vi.advanceTimersByTime(29000);
    });
    expect(scene.hasAttribute('data-asleep')).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(scene.getAttribute('data-asleep')).toBe('true');
    expect(announcement()).toBe(mochi.asleep);
    expect(scene.querySelector('.memory-mochi-zzz')?.textContent).toBe(
      mochi.sound.snore,
    );
    fireEvent.click(actionButton('laugh'));
    expect(scene.hasAttribute('data-asleep')).toBe(false);
    expect(scene.querySelector('.memory-mochi-zzz')).toBeNull();
    expect(announcement()).toBe(rising('laugh', 'By the lake'));
    // Any touch on the meadow also keeps them awake.
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    fireEvent.pointerDown(scene, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(scene, { pointerId: 1, clientX: 5, clientY: 5 });
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(scene.hasAttribute('data-asleep')).toBe(false);
  });

  it('shows a thought bubble with a gesture hint, hidden from assistive technology', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { scene } = renderMochis();
    act(() => {
      vi.advanceTimersByTime(2200);
    });
    const bubble = scene.querySelector('.memory-mochi-thought');
    expect(bubble?.getAttribute('aria-hidden')).toBe('true');
    expect(Object.values(mochi.hint)).toContain(bubble?.textContent);
    act(() => {
      vi.advanceTimersByTime(4200);
    });
    expect(scene.querySelector('.memory-mochi-thought')).toBeNull();
  });

  it('kisses after a long press on one of them', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { scene } = renderMochis();
    const own = scene.querySelector('.memory-mochi[data-person="own"]');
    if (!own) throw new Error('missing mochi');
    fireEvent.pointerDown(own, { pointerId: 1, clientX: 100, clientY: 300 });
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(announcement()).toBe(rising('kiss', 'By the lake'));
    fireEvent.pointerUp(own, { pointerId: 1, clientX: 100, clientY: 300 });
  });

  it('cuddles when one is pushed over to the other, and only boings on a tap', () => {
    const { scene } = renderMochis();
    const partner = scene.querySelector('.memory-mochi[data-person="partner"]');
    if (!partner) throw new Error('missing mochi');
    fireEvent.pointerDown(partner, {
      pointerId: 1,
      clientX: 200,
      clientY: 300,
    });
    fireEvent.pointerUp(partner, { pointerId: 1, clientX: 200, clientY: 300 });
    expect(hapticKinds()).toEqual(['press']);
    expect(
      partner.querySelector('.memory-mochi-body')?.getAttribute('data-poked'),
    ).toBe('true');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    // The right one is pushed to the left, towards the other one.
    fireEvent.pointerDown(partner, {
      pointerId: 2,
      clientX: 200,
      clientY: 300,
    });
    fireEvent.pointerMove(partner, {
      pointerId: 2,
      clientX: 180,
      clientY: 300,
    });
    fireEvent.pointerMove(partner, {
      pointerId: 2,
      clientX: 160,
      clientY: 300,
    });
    fireEvent.pointerUp(partner, { pointerId: 2, clientX: 160, clientY: 300 });
    expect(announcement()).toBe(rising('cuddle', 'By the lake'));
  });

  it('plays an action with motion and takes no second one until it ended', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    motionAllowed();
    const { scene } = renderMochis();
    fireEvent.click(actionButton('dance'));
    expect(scene.getAttribute('data-action')).toBe('dance');
    // The first action starts with the hop over to the other one.
    expect(scene.getAttribute('data-first')).toBe('true');
    expect(scene.getAttribute('data-together')).toBe('true');
    const balloon = screen.getByRole('link', {
      name: openName('By the lake'),
    });
    expect(balloon.getAttribute('data-animate')).toBe('true');
    expect(actionButton('kiss').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(actionButton('kiss'));
    expect(announcement()).toBe(rising('dance', 'By the lake'));
    act(() => {
      vi.advanceTimersByTime(550 + 1300);
    });
    expect(hapticKinds()).toEqual([
      'threshold',
      'threshold',
      'threshold',
      'threshold',
    ]);
    act(() => {
      vi.advanceTimersByTime(2900 - 1300);
    });
    expect(scene.hasAttribute('data-action')).toBe(false);
    expect(actionButton('kiss').hasAttribute('aria-disabled')).toBe(false);
    fireEvent.click(actionButton('kiss'));
    expect(scene.getAttribute('data-action')).toBe('kiss');
    expect(scene.hasAttribute('data-first')).toBe(false);
    expect(announcement()).toBe(rising('kiss', 'Thank you'));
  });

  it('shows the result at once with reduced motion', () => {
    const { scene } = renderMochis();
    fireEvent.click(actionButton('hug'));
    expect(scene.hasAttribute('data-action')).toBe(false);
    expect(scene.getAttribute('data-together')).toBe('true');
    const balloon = screen.getByRole('link', {
      name: openName('By the lake'),
    });
    expect(balloon.hasAttribute('data-animate')).toBe(false);
    expect(balloon.textContent).toContain('By the lake');
    // The next action needs no wait.
    fireEvent.click(actionButton('kiss'));
    expect(announcement()).toBe(rising('kiss', 'Thank you'));
  });

  it('renders nothing without memories', () => {
    const { container } = render(
      <MemoryRouter>
        <MochiWorld
          entries={[]}
          kicker=""
          loadMemoryImage={vi.fn()}
          onOpen={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });
});
