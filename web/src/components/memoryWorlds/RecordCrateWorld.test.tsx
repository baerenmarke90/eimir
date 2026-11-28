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
import { RecordCrateWorld } from './RecordCrateWorld';

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

// Without matchMedia the app's reduced-motion source reports reduced motion:
// every flight and the motor resolve at once, so the world is deterministic.
const entries = [
  entry('a', { isLead: true, title: 'By the lake', verses: ['in Konstanz'] }),
  entry('b', {
    kind: 'heart',
    emotion: 'LOVED',
    title: 'Thank you',
    date: new Date('2025-02-14T00:00:00Z'),
    dateLabel: '14. Februar 2025',
  }),
  entry('c', { kind: 'milestone', title: 'Moved in together' }),
];

function renderCrate(onOpen = vi.fn()) {
  render(
    <MemoryRouter>
      <RecordCrateWorld
        entries={entries}
        kicker="Two years ago today"
        loadMemoryImage={vi.fn()}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
  return screen.getByRole('group', {
    name: fill(copy.crate.label_other, { count: 3 }),
  });
}

afterEach(() => {
  cleanup();
});

describe('RecordCrateWorld', () => {
  it('shows sleeves that print only their kind and month', () => {
    const crate = renderCrate();
    expect(crate.getAttribute('aria-roledescription')).toBe(
      copy.crate.roleDescription,
    );
    const memory = screen.getByRole('img', {
      name: fill(copy.crate.sleeveName, {
        kind: copy.crate.kind.memory,
        title: 'By the lake',
        date: '24. August 2026',
      }),
    });
    const heart = screen.getByRole('img', {
      name: fill(copy.crate.sleeveName, {
        kind: copy.crate.kind.heart,
        title: 'Thank you',
        date: '14. Februar 2025',
      }),
    });
    expect(
      screen.getByRole('img', {
        name: fill(copy.crate.sleeveName, {
          kind: copy.crate.kind.milestone,
          title: 'Moved in together',
          date: '24. August 2026',
        }),
      }),
    ).toBeTruthy();
    // The cover itself shows neither title nor date: only the month.
    expect(memory.textContent).toBe('August 2026');
    expect(heart.textContent).toBe('Februar 2025');
    expect(heart.querySelector('[data-kind="heart"]')).not.toBeNull();
  });

  it('puts the front record on with Enter and back with Escape', () => {
    const crate = renderCrate();
    crate.focus();
    act(() => {
      fireEvent.keyDown(crate, { key: 'Enter' });
    });
    expect(
      screen.getByText(
        fill(copy.crate.playingBy, {
          title: 'By the lake',
          date: '24. August 2026',
          name: 'Lea',
        }),
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: fill(copy.crate.openInDiaryLabel, { title: 'By the lake' }),
      }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.crate.stop })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copy.crate.backToCrate }),
    ).toBeTruthy();

    act(() => {
      fireEvent.keyDown(crate, { key: 'Escape' });
    });
    expect(screen.getByText(copy.crate.returned)).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: copy.crate.startFront,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('link', {
        name: fill(copy.crate.openInDiaryLabel, { title: 'By the lake' }),
      }),
    ).toBeNull();
  });

  it('flips through the crate with the arrow keys', () => {
    const crate = renderCrate();
    act(() => {
      fireEvent.keyDown(crate, { key: 'ArrowDown' });
    });
    expect(
      screen.getByText(
        fill(copy.crate.front, {
          title: 'Thank you',
          date: '14. Februar 2025',
          position: 2,
          count: 3,
        }),
      ),
    ).toBeTruthy();
    act(() => {
      fireEvent.keyDown(crate, { key: 'End' });
    });
    expect(
      screen.getByText(
        fill(copy.crate.front, {
          title: 'Moved in together',
          date: '24. August 2026',
          position: 3,
          count: 3,
        }),
      ),
    ).toBeTruthy();
  });

  it('opens the playing memory and offers the plinth controls', () => {
    const onOpen = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    renderCrate(onOpen);
    act(() => {
      fireEvent.click(
        screen.getByRole('button', {
          name: copy.crate.startFront,
        }),
      );
    });
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: fill(copy.crate.rpm, { rpm: 45 }) }),
      );
    });
    expect(
      screen.getByText(fill(copy.crate.speedChanged, { rpm: 45 })),
    ).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: copy.crate.stop }));
    });
    expect(screen.getByText(copy.crate.stopped)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('link', {
        name: fill(copy.crate.openInDiaryLabel, { title: 'By the lake' }),
      }),
    );
    expect(onOpen.mock.calls[0].slice(1)).toEqual(['/story/memories/a', 'a']);
  });

  it('keeps every memory reachable as a plain list for screen readers', () => {
    renderCrate();
    const list = screen.getByRole('list', {
      name: copy.crate.allRecords,
    });
    expect(list.querySelectorAll('a')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: 'Thank you, 14. Februar 2025' }),
    ).toBeTruthy();
  });
});
