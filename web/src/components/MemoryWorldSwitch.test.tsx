// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worldsCopy from '../i18n/locales/memoryWorlds';
import settingsCopy from '../i18n/locales/memoryWorldSettings';
import {
  MEMORY_WORLD_TOOLBAR_SLOT_ID,
  MemoryWorldSwitch,
} from './MemoryWorldSwitch';
import { entry } from './memoryWorlds/__fixtures__/stories';
import { PhotoBoothWorld } from './memoryWorlds/PhotoBoothWorld';

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function switchLink() {
  return screen.getByRole('link', {
    name: fill(settingsCopy.switchWorldCurrent, {
      name: settingsCopy.worlds.booth.name,
    }),
  });
}

describe('MemoryWorldSwitch', () => {
  it('keeps "Welt wechseln" as a link to the setting, after an empty toolbar slot', () => {
    render(
      <MemoryRouter>
        <MemoryWorldSwitch world="booth" />
      </MemoryRouter>,
    );
    const link = switchLink();
    expect(link.textContent).toBe(settingsCopy.switchWorld);
    expect(link.getAttribute('href')).toContain('#');
    const slot = document.getElementById(MEMORY_WORLD_TOOLBAR_SLOT_ID);
    if (!slot) throw new Error('The toolbar slot is missing.');
    expect(slot.childElementCount).toBe(0);
    // The slot comes first in the row, the link stays at its end.
    expect(slot.parentElement).toBe(link.parentElement);
    expect(
      slot.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('takes the Fotoautomat style switch into the same row', () => {
    render(
      <MemoryRouter>
        <MemoryWorldSwitch world="booth" />
        <PhotoBoothWorld
          entries={[entry('a', { isLead: true, title: 'By the lake' })]}
          kicker="Two years ago today"
          loadMemoryImage={vi.fn()}
          onOpen={vi.fn()}
        />
      </MemoryRouter>,
    );
    const slot = document.getElementById(MEMORY_WORLD_TOOLBAR_SLOT_ID);
    const group = screen.getByRole('group', {
      name: worldsCopy.booth.styleLabel,
    });
    expect(slot?.contains(group)).toBe(true);
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([worldsCopy.booth.style.classic, worldsCopy.booth.style.modern]);
    expect(switchLink()).toBeTruthy();
  });
});
