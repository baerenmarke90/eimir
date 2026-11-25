// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import copy from '../../i18n/locales/memoryWorlds';
import { entry } from './__fixtures__/stories';
import type { MemoryWorldEntry } from './model';
import { keyHash } from './model';
import { ScratchCardWorld } from './ScratchCardWorld';
import { bonusFor, coinSymbols, ticketSerial, tripleOf } from './scratchTicket';

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const scratch = copy.scratch;

/** The first key with this prefix whose ticket has (or lacks) a triple. */
function keyWhere(prefix: string, triple: boolean): string {
  for (let index = 0; index < 500; index += 1) {
    const key = `${prefix}-${index}`;
    if ((tripleOf(coinSymbols(keyHash(key))) !== null) === triple) return key;
  }
  throw new Error('no key found');
}

function roll(leadKey: string): MemoryWorldEntry[] {
  return [
    entry(leadKey, { isLead: true, title: 'By the lake' }),
    entry('heart', {
      kind: 'heart',
      emotion: 'LOVED',
      title: 'Thank you',
      dateLabel: '14. Februar 2025',
    }),
    entry('milestone', { kind: 'milestone', title: 'Moved in together' }),
  ];
}

function renderWorld(entries: MemoryWorldEntry[], onOpen = vi.fn()) {
  render(
    <MemoryRouter>
      <ScratchCardWorld
        entries={entries}
        kicker="Two years ago today"
        loadMemoryImage={vi.fn()}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
  return onOpen;
}

function ticket(key: string) {
  return screen.getByRole('group', {
    name: fill(scratch.label, { serial: ticketSerial(key) }),
  });
}

function liveRegion() {
  return document.querySelector('[aria-live="polite"]');
}

function motionAllowed() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  // jsdom has no 2D canvas: the foils stay unpainted, the button reveals.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ScratchCardWorld', () => {
  it('shows the lead as a sealed lucky ticket with its printed rules', () => {
    const lead = keyWhere('lead', false);
    renderWorld(roll(lead));
    expect(screen.getByRole('heading', { name: scratch.heading })).toBeTruthy();
    const card = ticket(lead);
    expect(card.getAttribute('aria-roledescription')).toBe(
      scratch.roleDescription,
    );
    expect(screen.getByText(scratch.rule)).toBeTruthy();
    expect(screen.getByText(scratch.win.blank)).toBeTruthy();
    expect(screen.getByText(scratch.bonus.hint)).toBeTruthy();
    // Nothing can be opened before the heart is scratched free.
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByRole('button', { name: scratch.reveal })).toBeTruthy();
    // The foils are canvases, decorative for assistive technology.
    const foils = card.querySelectorAll('canvas[data-active="true"]');
    expect(foils).toHaveLength(4);
    for (const foil of foils)
      expect(foil.getAttribute('aria-hidden')).toBe('true');
  });

  it('reveals the memory by keyboard and announces the win', () => {
    const lead = keyWhere('lead', false);
    const onOpen = renderWorld(roll(lead));
    const button = screen.getByRole('button', { name: scratch.reveal });
    button.focus();
    fireEvent.click(button);
    const open = screen.getByRole('link', {
      name: fill(scratch.openLabel, {
        title: 'By the lake',
        date: '24. August 2026',
      }),
    });
    expect(open.getAttribute('href')).toBe(`/story/memories/${lead}`);
    expect(screen.getByText(scratch.win.ask)).toBeTruthy();
    expect(liveRegion()?.textContent).toBe(
      fill(scratch.won, { title: 'By the lake', date: '24. August 2026' }),
    );
    // Every foil is gone, the coins as well.
    expect(
      ticket(lead).querySelectorAll('canvas[data-gone="true"]'),
    ).toHaveLength(4);
    expect(screen.getByText(scratch.bonus.none)).toBeTruthy();
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      `/story/memories/${lead}`,
      lead,
    );
  });

  it('writes the memory under the foil as a handwritten card', () => {
    const lead = keyWhere('lead', false);
    renderWorld(roll(lead));
    const card = ticket(lead).querySelector('.memory-scratch-card');
    expect(card?.getAttribute('data-kind')).toBe('words');
    expect(card?.textContent).toBe('By the lake');
  });

  it('tears the won ticket off and dispenses the next memory', () => {
    const lead = keyWhere('lead', false);
    renderWorld(roll(lead));
    fireEvent.click(screen.getByRole('button', { name: scratch.reveal }));
    fireEvent.click(screen.getByRole('button', { name: scratch.tear }));
    // Reduced motion (no matchMedia): the old ticket leaves at once.
    expect(
      screen.queryByRole('group', {
        name: fill(scratch.label, { serial: ticketSerial(lead) }),
      }),
    ).toBeNull();
    expect(ticket('heart')).toBeTruthy();
    expect(liveRegion()?.textContent).toBe(scratch.fresh);
    expect(screen.getByRole('button', { name: scratch.reveal })).toBeTruthy();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    // The heart moment is written on the card, with who wrote it.
    const card = ticket('heart').querySelector('.memory-scratch-card');
    expect(card?.getAttribute('data-emotion')).toBe('LOVED');
    expect(card?.textContent).toContain('Thank you');
  });

  it('brings an extra memory for three equal coins', () => {
    const lead = keyWhere('lead', true);
    const entries = roll(lead);
    const onOpen = renderWorld(entries);
    fireEvent.click(screen.getByRole('button', { name: scratch.reveal }));
    const hash = keyHash(lead);
    const symbol = tripleOf(coinSymbols(hash));
    if (!symbol) throw new Error('expected a triple');
    const extra = bonusFor(entries, entries[0], symbol, hash);
    if (!extra) throw new Error('expected an extra memory');
    expect(screen.getByText(scratch.bonus.stamp)).toBeTruthy();
    expect(screen.getByText(scratch.bonus[symbol])).toBeTruthy();
    const link = screen.getByRole('link', {
      name: fill(scratch.bonus.link, {
        title: extra.title,
        date: extra.dateLabel,
      }),
    });
    expect(link.getAttribute('href')).toBe(extra.path);
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      extra.path,
      extra.key,
    );
  });

  it('is still lucky twice on a roll of one memory', () => {
    const lead = keyWhere('solo', true);
    renderWorld([entry(lead, { isLead: true, title: 'Only one' })]);
    fireEvent.click(screen.getByRole('button', { name: scratch.reveal }));
    expect(screen.getByText(scratch.bonus.double)).toBeTruthy();
  });

  it('celebrates only without reduced motion', () => {
    const lead = keyWhere('lead', false);
    renderWorld(roll(lead));
    fireEvent.click(screen.getByRole('button', { name: scratch.reveal }));
    expect(ticket(lead).getAttribute('data-celebrate')).toBeNull();
    expect(document.querySelector('.memory-scratch-confetti')).toBeNull();
    cleanup();

    motionAllowed();
    renderWorld(roll(lead));
    fireEvent.click(screen.getByRole('button', { name: scratch.reveal }));
    expect(ticket(lead).getAttribute('data-celebrate')).toBe('true');
    expect(document.querySelector('.memory-scratch-confetti')).toBeTruthy();
    // Without Web Animations the torn ticket leaves at once; the next one
    // slides out of the dispenser.
    fireEvent.click(screen.getByRole('button', { name: scratch.tear }));
    expect(ticket('heart').getAttribute('data-feed')).toBe('true');
    expect(
      document
        .querySelector('.memory-scratch-disp-crank')
        ?.getAttribute('data-motion'),
    ).toBe('turn');
  });

  it('renders nothing without memories', () => {
    const { container } = render(
      <MemoryRouter>
        <ScratchCardWorld
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
