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
import rediscovery from '../../i18n/locales/rediscovery';
import { haptic } from '../../motion/haptics';
import { entry } from './__fixtures__/stories';
import { BOOTH_STYLE_KEY } from './boothStylePreference';
import { boothStrips, PhotoBoothWorld } from './PhotoBoothWorld';

vi.mock('../../motion/haptics', () => ({ haptic: vi.fn() }));

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const booth = copy.booth;
const SUMMER_2026 = fill(rediscovery.season.line, {
  season: rediscovery.season.summer,
  year: 2026,
});
const STRIP = fill(booth.viewStrip, { span: SUMMER_2026 });

// Without matchMedia the app's reduced-motion source reports reduced motion:
// a run shows its finished strip at once, so the world is deterministic.
const entries = [
  entry('a', { isLead: true, title: 'By the lake' }),
  entry('b', { kind: 'heart', emotion: 'LOVED', title: 'Thank you' }),
  entry('c', { kind: 'milestone', title: 'Moved in together' }),
  entry('d', { title: 'Picnic in the park' }),
];

function renderBooth(onOpen = vi.fn()) {
  return render(
    <MemoryRouter>
      <PhotoBoothWorld
        entries={entries}
        kicker="Two years ago today"
        loadMemoryImage={vi.fn()}
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
  return document.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

function styleButton(name: string) {
  return within(
    screen.getByRole('group', { name: booth.styleLabel }),
  ).getByRole('button', { name });
}

function hapticKinds() {
  return vi.mocked(haptic).mock.calls.map(([kind]) => kind);
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.mocked(haptic).mockClear();
});

describe('boothStrips', () => {
  it('puts the lead with its three closest moments first and fills short strips', () => {
    const list = [
      entry('far', { date: new Date('2020-01-01T00:00:00Z') }),
      entry('lead', { isLead: true, date: new Date('2026-08-24T00:00:00Z') }),
      entry('near', { date: new Date('2026-08-20T00:00:00Z') }),
      entry('next', { date: new Date('2026-07-01T00:00:00Z') }),
      entry('later', { date: new Date('2026-06-01T00:00:00Z') }),
      entry('old', { date: new Date('2019-05-01T00:00:00Z') }),
    ];
    const strips = boothStrips(list);
    expect(strips).toHaveLength(2);
    // Oldest first within a strip.
    expect(strips[0].map((item) => item.key)).toEqual([
      'later',
      'next',
      'near',
      'lead',
    ]);
    // Two remaining moments come back like another pose.
    expect(strips[1].map((item) => item.key)).toEqual([
      'old',
      'far',
      'old',
      'far',
    ]);
    expect(boothStrips([])).toEqual([]);
  });
});

describe('PhotoBoothWorld style switch', () => {
  it('starts in the classic cabin with a labelled pair of toggle buttons', () => {
    renderBooth();
    expect(
      screen.getByRole('heading', { name: booth.classic.heading }),
    ).toBeTruthy();
    expect(styleButton(booth.style.classic).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(styleButton(booth.style.modern).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(
      screen.getByRole('button', { name: booth.classic.coin }),
    ).toBeTruthy();
  });

  it('switches to the modern booth and keeps the choice on this device', () => {
    renderBooth();
    fireEvent.click(styleButton(booth.style.modern));
    expect(window.localStorage.getItem(BOOTH_STYLE_KEY)).toBe('modern');
    expect(
      screen.getByRole('heading', { name: booth.modern.heading }),
    ).toBeTruthy();
    expect(styleButton(booth.style.modern).getAttribute('aria-pressed')).toBe(
      'true',
    );

    cleanup();
    renderBooth();
    expect(
      screen.getByRole('heading', { name: booth.modern.heading }),
    ).toBeTruthy();
    fireEvent.click(styleButton(booth.style.classic));
    expect(window.localStorage.getItem(BOOTH_STYLE_KEY)).toBe('classic');
    expect(
      screen.getByRole('heading', { name: booth.classic.heading }),
    ).toBeTruthy();
  });

  it('shows the style switch right below the booth heading', () => {
    renderBooth();
    const group = screen.getByRole('group', { name: booth.styleLabel });
    const heading = screen.getByRole('heading', {
      name: booth.classic.heading,
    });
    expect(heading.parentElement?.nextElementSibling).toBe(group);
  });
});

describe('PhotoBoothWorld modern', () => {
  function renderModern(onOpen = vi.fn()) {
    window.localStorage.setItem(BOOTH_STYLE_KEY, 'modern');
    renderBooth(onOpen);
    return screen.getByRole('button', { name: booth.modern.print });
  }

  it('prints a strip at once with reduced motion', () => {
    const button = renderModern();
    act(() => {
      fireEvent.click(button);
    });
    expect(screen.getByRole('button', { name: STRIP })).toBeTruthy();
    expect(announcement()).toBe(booth.modern.doneSpoken);
    expect(button.textContent).toBe(booth.modern.printAgain);
    expect(screen.getByRole('button', { name: booth.view })).toBeTruthy();
  });

  it('counts down, takes four shots and prints the strip on its clock', () => {
    motionAllowed();
    vi.useFakeTimers();
    const button = renderModern();
    act(() => {
      fireEvent.click(button);
    });
    expect(announcement()).toBe('3');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.textContent).toBe(booth.modern.printing);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(announcement()).toBe('2');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(announcement()).toBe(fill(booth.shotSpoken, { shot: 1, shots: 4 }));
    // A press while the booth is busy changes nothing.
    act(() => {
      fireEvent.click(button);
    });
    act(() => {
      vi.advanceTimersByTime(3750);
    });
    expect(announcement()).toBe(fill(booth.shotSpoken, { shot: 4, shots: 4 }));
    expect(screen.queryByRole('button', { name: STRIP })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1050);
    });
    expect(announcement()).toBe(booth.modern.printSpoken);
    expect(screen.getByRole('button', { name: STRIP })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(announcement()).toBe(booth.modern.doneSpoken);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button.textContent).toBe(booth.modern.printAgain);
    const kinds = hapticKinds();
    expect(kinds[0]).toBe('press');
    expect(kinds.filter((kind) => kind === 'commit')).toHaveLength(4);
    expect(kinds[kinds.length - 1]).toBe('success');
  });

  it('opens the strip as a dialog and returns focus on Escape', () => {
    const onOpen = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    const button = renderModern(onOpen);
    act(() => {
      fireEvent.click(button);
    });
    const strip = screen.getByRole('button', { name: STRIP });
    strip.focus();
    fireEvent.click(strip);
    const dialog = screen.getByRole('dialog', { name: SUMMER_2026 });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = within(dialog).getByRole('button', {
      name: booth.viewer.close,
    });
    expect(document.activeElement).toBe(close);
    // Every moment once, each one opening the diary.
    const links = within(dialog).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[0].textContent).toContain('By the lake');
    expect(links[0].textContent).toContain(booth.viewer.openInDiary);

    // Focus stays inside the dialog.
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(links[0]);
    fireEvent.keyDown(links[0], { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);

    fireEvent.click(links[1]);
    expect(onOpen.mock.calls[0].slice(1)).toEqual(['/story/memories/b', 'b']);

    act(() => {
      fireEvent.keyDown(close, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(strip);
  });

  it('hangs the fresh strip on the line and moves focus there', () => {
    const button = renderModern();
    act(() => {
      fireEvent.click(button);
    });
    fireEvent.click(screen.getByRole('button', { name: booth.view }));
    const dialog = screen.getByRole('dialog', { name: SUMMER_2026 });
    act(() => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: booth.modern.hang }),
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    const line = screen.getByRole('region', { name: booth.modern.line });
    const hung = within(line).getByRole('button', { name: STRIP });
    expect(document.activeElement).toBe(hung);
    expect(screen.queryByRole('button', { name: booth.view })).toBeNull();
    expect(hapticKinds()).toContain('commit');
  });
});

describe('PhotoBoothWorld classic', () => {
  it('drops a dry strip at once with reduced motion and puts it in the tin', () => {
    renderBooth();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: booth.classic.coin }));
    });
    expect(announcement()).toBe(booth.classic.doneSpoken);
    expect(screen.getByRole('button', { name: STRIP })).toBeTruthy();
    expect(screen.queryByText(booth.classic.wetHint)).toBeNull();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: booth.classic.box }));
    });
    const tin = screen.getByRole('region', { name: booth.classic.tinLabel });
    expect(document.activeElement).toBe(
      within(tin).getByRole('button', { name: STRIP }),
    );
  });

  it('runs the cabin on its clock: curtain, flashes, development, a wet strip that dries', () => {
    motionAllowed();
    vi.useFakeTimers();
    renderBooth();
    const coin = screen.getByRole('button', { name: booth.classic.coin });
    act(() => {
      fireEvent.click(coin);
    });
    expect(announcement()).toBe(booth.classic.coinSpoken);
    expect(coin.getAttribute('aria-disabled')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(announcement()).toBe(booth.classic.closingSpoken);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(announcement()).toBe(fill(booth.shotSpoken, { shot: 1, shots: 4 }));
    act(() => {
      vi.advanceTimersByTime(4700);
    });
    expect(announcement()).toBe(booth.classic.developSpoken);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(announcement()).toBe(booth.classic.wetSpoken);
    expect(screen.getByRole('button', { name: STRIP })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Still wet: the strip asks to be waved dry, it also dries by itself.
    expect(screen.getByText(booth.classic.wetHint)).toBeTruthy();
    expect(screen.queryByRole('button', { name: booth.view })).toBeNull();
    expect(coin.hasAttribute('aria-disabled')).toBe(false);
    for (let tick = 0; tick < 20; tick += 1)
      act(() => {
        vi.advanceTimersByTime(500);
      });
    expect(screen.queryByText(booth.classic.wetHint)).toBeNull();
    expect(screen.getByRole('button', { name: booth.view })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: booth.classic.box }),
    ).toBeTruthy();
    expect(hapticKinds().filter((kind) => kind === 'success')).toHaveLength(2);
  });

  it('opens the cabin strip and returns focus to the action that opened it', () => {
    renderBooth();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: booth.classic.coin }));
    });
    const view = screen.getByRole('button', { name: booth.view });
    view.focus();
    fireEvent.click(view);
    const dialog = screen.getByRole('dialog', { name: SUMMER_2026 });
    expect(
      within(dialog).getByRole('button', { name: booth.classic.box }),
    ).toBeTruthy();
    act(() => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(view);
  });
});
