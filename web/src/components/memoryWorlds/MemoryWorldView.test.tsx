// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import copy from '../../i18n/locales/memoryWorlds';
import { heartItem, memoryItem, milestoneItem } from './__fixtures__/stories';
import { MemoryWorldView } from './MemoryWorldView';
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
  world: 'stack' | 'crate' | 'cloud',
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

  it('ignores the rest of the diary outside the Momentwolke', () => {
    renderWorld('stack', moreItems);
    expect(
      screen.getByText(fill(copy.stack.position, { position: 1, count: 2 })),
    ).toBeTruthy();
  });
});
