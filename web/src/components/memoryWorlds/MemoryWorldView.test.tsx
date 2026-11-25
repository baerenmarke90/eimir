// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import copy from '../../i18n/locales/memoryWorlds';
import { heartItem, memoryItem, milestoneItem } from './__fixtures__/stories';
import { MemoryWorldView, type MemoryWorldViewWorld } from './MemoryWorldView';
import { ticketSerial } from './scratchTicket';
import { SENSITIVE_IN_WORLDS_KEY } from './sensitivePreference';

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const lead = heartItem('h', 'Thank you');
const items = [
  lead,
  memoryItem('s', 'Private', { photos: [{ id: 'secret', sensitive: true }] }),
  milestoneItem('ms', 'Moved in together'),
];

/** The rest of the loaded diary: duplicates of the selection and two more. */
const moreItems = [
  milestoneItem('ms', 'Moved in together'),
  memoryItem('m2', 'Picnic in the park', { date: '2026-05-01' }),
  lead,
  memoryItem('s2', 'Also private', {
    photos: [{ id: 'secret-2', sensitive: true }],
  }),
];

function renderWorld(
  world: MemoryWorldViewWorld,
  more: typeof moreItems | undefined = undefined,
) {
  return render(
    <MemoryRouter>
      <MemoryWorldView
        world={world}
        lead={lead}
        leadKicker="Two years ago today"
        leadHeadline="A heart moment"
        items={items}
        moreItems={more}
        loadMemoryImage={vi.fn()}
        onOpen={vi.fn()}
      />
    </MemoryRouter>,
  );
}

function cloudListTitles() {
  const list = screen.getByRole('list', { name: copy.cloud.allMemories });
  return [...list.querySelectorAll('a')].map(
    (link) => link.textContent?.split(', ')[0],
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('MemoryWorldView', () => {
  it('renders the Stapel with the lead first and sensitive covers left out', () => {
    renderWorld('stack');
    expect(
      screen.getByRole('link', {
        name: fill(copy.stack.open, { title: 'Thank you' }),
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(fill(copy.stack.position, { position: 1, count: 2 })),
    ).toBeTruthy();
  });

  it('renders the Plattenkiste from the same selection', () => {
    window.localStorage.setItem(SENSITIVE_IN_WORLDS_KEY, 'hide');
    renderWorld('crate');
    expect(
      screen.getByRole('group', {
        name: fill(copy.crate.label_other, { count: 2 }),
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Private/u })).toBeNull();
  });

  it('shows the whole loaded diary in the Momentwolke without duplicates', () => {
    renderWorld('cloud', moreItems);
    expect(
      screen.getByRole('group', {
        name: fill(copy.cloud.label_other, { count: 3 }),
      }),
    ).toBeTruthy();
    // The lead first, then newest first; sensitive covers stay out.
    expect(cloudListTitles()).toEqual([
      'Thank you',
      'Picnic in the park',
      'Moved in together',
    ]);
  });

  it('keeps memories with a sensitive cover in the cloud once this device shows them', () => {
    window.localStorage.setItem(SENSITIVE_IN_WORLDS_KEY, 'show');
    renderWorld('cloud', moreItems);
    expect(cloudListTitles()).toEqual([
      'Thank you',
      'Private',
      'Also private',
      'Picnic in the park',
      'Moved in together',
    ]);
  });

  it('renders the Fotoautomat from the same selection', () => {
    renderWorld('booth', moreItems);
    expect(
      screen.getByRole('heading', { name: copy.booth.classic.heading }),
    ).toBeTruthy();
    expect(
      screen.getByRole('group', { name: copy.booth.styleLabel }),
    ).toBeTruthy();
    // Reduced motion: the strip is there at once. Sensitive covers and the
    // rest of the diary stay out; the moments come oldest first.
    fireEvent.click(
      screen.getByRole('button', { name: copy.booth.classic.coin }),
    );
    fireEvent.click(screen.getByRole('button', { name: copy.booth.view }));
    const dialog = screen.getByRole('dialog', {
      name: fill(copy.booth.span, { from: 2024, to: 2025 }),
    });
    expect(
      [...dialog.querySelectorAll('.memory-booth-contact-text strong')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Moved in together', 'Thank you']);
  });

  it('renders the Kühlschranktür from the same selection', () => {
    renderWorld('fridge', moreItems);
    // The lead first; sensitive covers and the rest of the diary stay out.
    const door = screen.getByRole('group', {
      name: fill(copy.fridge.label_other, { count: 2 }),
    });
    expect(door.getAttribute('aria-roledescription')).toBe(
      copy.fridge.roleDescription,
    );
    const list = screen.getByRole('list', { name: copy.fridge.allMemories });
    expect(
      [...list.querySelectorAll('a')].map(
        (link) => link.textContent?.split(', ')[0],
      ),
    ).toEqual(['Thank you', 'Moved in together']);
  });

  it('renders the Fotobuch from the same selection', () => {
    renderWorld('album', moreItems);
    // Cover, one season opener per season, the two pages and the end page;
    // sensitive covers and the rest of the diary stay out.
    const book = screen.getByRole('group', {
      name: fill(copy.album.label, { page: 1, count: 6 }),
    });
    expect(book.getAttribute('aria-roledescription')).toBe(
      copy.album.roleDescription,
    );
    expect(
      screen.getByText(fill(copy.album.moments_other, { count: 2 })),
    ).toBeTruthy();
  });

  it('renders the Rubbellos from the same selection, the lead first', () => {
    // jsdom has no 2D canvas: the foils stay unpainted.
    const canvas = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    const { container } = renderWorld('scratch', moreItems);
    expect(
      container.querySelector('.memory-world')?.getAttribute('data-world'),
    ).toBe('scratch');
    const ticket = screen.getByRole('group', {
      name: fill(copy.scratch.label, { serial: ticketSerial('heart-h') }),
    });
    expect(ticket.getAttribute('aria-roledescription')).toBe(
      copy.scratch.roleDescription,
    );
    expect(
      screen.getByRole('button', { name: copy.scratch.reveal }),
    ).toBeTruthy();
    canvas.mockRestore();
  });

  it('renders the Mochis from the same selection, the lead first', () => {
    const { container } = renderWorld('mochi', moreItems);
    expect(
      container.querySelector('.memory-world')?.getAttribute('data-world'),
    ).toBe('mochi');
    const meadow = screen.getByRole('group', { name: copy.mochi.label });
    expect(meadow.getAttribute('aria-roledescription')).toBe(
      copy.mochi.roleDescription,
    );
    // Reduced motion: each balloon is there at once, the lead first; the
    // sensitive cover and the rest of the diary stay out.
    const actions = screen.getByRole('group', { name: copy.mochi.actions });
    for (const kind of ['cuddle', 'kiss', 'hug'] as const)
      fireEvent.click(
        within(actions).getByRole('button', { name: copy.mochi.action[kind] }),
      );
    const sky = screen.getByRole('list', { name: copy.mochi.sky });
    expect(
      [...sky.querySelectorAll('a')].map((link) => link.textContent),
    ).toEqual(['Moved in together']);
    const held = container.querySelector('.memory-mochi-balloon strong');
    expect(held?.textContent).toBe('Thank you');
  });

  it('renders the Sternbild from the same selection, ordered by time', () => {
    const { container } = renderWorld('stars', moreItems);
    expect(
      container.querySelector('.memory-world')?.getAttribute('data-world'),
    ).toBe('stars');
    const sky = screen.getByRole('group', { name: copy.stars.label });
    expect(sky.getAttribute('aria-roledescription')).toBe(
      copy.stars.roleDescription,
    );
    // The sensitive cover and the rest of the diary stay out; the lead is lit.
    const stars = [...sky.querySelectorAll('[data-stars-star]')];
    expect(stars).toHaveLength(2);
    expect(stars[0].getAttribute('aria-label')).toMatch(
      /^Moved in together, /u,
    );
    expect(stars[1].getAttribute('aria-label')).toMatch(/^Thank you, /u);
    expect(stars[1].getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByText(fill(copy.stars.position, { position: 2, count: 2 })),
    ).toBeTruthy();
  });

  it('renders the Post from the same selection, the lead first', () => {
    const { container } = renderWorld('post', moreItems);
    expect(
      container.querySelector('.memory-world')?.getAttribute('data-world'),
    ).toBe('post');
    // Reduced motion: each letter is opened at once; the sensitive cover and
    // the rest of the diary stay out, and the delivery starts over.
    const opened: string[] = [];
    for (let letter = 0; letter < 3; letter += 1) {
      fireEvent.click(screen.getByRole('button', { name: copy.post.openBox }));
      const flap =
        container.querySelector<HTMLButtonElement>('.memory-post-flap');
      if (!flap) throw new Error('no envelope');
      fireEvent.click(flap);
      const link = container.querySelector('.memory-post-open');
      opened.push(link?.getAttribute('aria-label') ?? '');
      fireEvent.click(screen.getByRole('button', { name: copy.post.file }));
    }
    expect(opened).toEqual(
      ['Thank you', 'Moved in together', 'Thank you'].map((title) =>
        fill(copy.post.openNamed, { title }),
      ),
    );
  });

  it('renders the Glas from the same selection, the lead drawn first', () => {
    const { container } = renderWorld('jar', moreItems);
    expect(
      container.querySelector('.memory-world')?.getAttribute('data-world'),
    ).toBe('jar');
    // The sensitive cover and the rest of the diary stay out of the jar.
    const jar = screen.getByRole('group', {
      name: fill(copy.jar.label_other, { count: 2 }),
    });
    // Reduced motion: a press of the tag draws the lead at once.
    fireEvent.click(
      within(jar).getByRole('button', { name: copy.jar.tag.drawLabel }),
    );
    expect(
      screen.getByRole('link', {
        name: fill(copy.jar.diaryNamed, { title: 'Thank you' }),
      }),
    ).toBeTruthy();
    window.localStorage.clear();
  });

  it('ignores the rest of the diary outside the Momentwolke', () => {
    renderWorld('stack', moreItems);
    expect(
      screen.getByText(fill(copy.stack.position, { position: 1, count: 2 })),
    ).toBeTruthy();
  });
});
