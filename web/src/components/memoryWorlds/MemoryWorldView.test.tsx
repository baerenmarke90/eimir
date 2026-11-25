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

function renderWorld(world: 'stack' | 'crate') {
  return render(
    <MemoryRouter>
      <MemoryWorldView
        world={world}
        lead={lead}
        leadKicker="Two years ago today"
        leadHeadline="A heart moment"
        items={items}
        loadMemoryImage={vi.fn()}
        onOpen={vi.fn()}
      />
    </MemoryRouter>,
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
});
