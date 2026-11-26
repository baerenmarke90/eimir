// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worldsCopy from '../i18n/locales/memoryWorlds';
import settingsCopy from '../i18n/locales/memoryWorldSettings';
import { MemoryWorldSwitch } from './MemoryWorldSwitch';
import { entry } from './memoryWorlds/__fixtures__/stories';
import { PhotoBoothWorld } from './memoryWorlds/PhotoBoothWorld';
import { StackWorld } from './memoryWorlds/StackWorld';
import { WorldSwitchProvider } from './memoryWorlds/WorldHead';

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const switchName = (world: 'booth' | 'stack') =>
  fill(settingsCopy.switchWorldCurrent, {
    name: settingsCopy.worlds[world].name,
  });

const worldProps = {
  entries: [
    entry('a', { isLead: true, title: 'By the lake' }),
    entry('b', { title: 'Winter evening' }),
  ],
  kicker: 'Two years ago today',
  loadMemoryImage: vi.fn(),
  onOpen: vi.fn(),
};

describe('MemoryWorldSwitch', () => {
  it('is a round picture link to the setting that names the current world', () => {
    render(
      <MemoryRouter>
        <MemoryWorldSwitch world="booth" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: switchName('booth') });
    expect(link.textContent).toBe('');
    expect(link.getAttribute('href')).toContain('#');
    expect(link.querySelector('.memory-world-switch-art svg')).toBeTruthy();
  });

  it('ends the world heading row, after the heading and its extras', () => {
    render(
      <MemoryRouter>
        <WorldSwitchProvider value="stack">
          <StackWorld {...worldProps} />
        </WorldSwitchProvider>
      </MemoryRouter>,
    );
    const heading = screen.getByRole('heading', {
      name: worldsCopy.stack.heading,
    });
    const row = heading.parentElement;
    if (!row) throw new Error('The heading row is missing.');
    const link = screen.getByRole('link', { name: switchName('stack') });
    expect(link.parentElement).toBe(row);
    expect(row.lastElementChild).toBe(link);
    expect(row.textContent).toContain(
      fill(worldsCopy.stack.position, { position: 1, count: 2 }),
    );
  });

  it('is not shown in a world outside Momente › Erinnerungen', () => {
    render(
      <MemoryRouter>
        <StackWorld {...worldProps} />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('link', { name: switchName('stack') }),
    ).toBeNull();
    expect(document.querySelector('.memory-world-switch')).toBeNull();
  });

  it('keeps the Fotoautomat style switch in the world, below its heading', () => {
    render(
      <MemoryRouter>
        <WorldSwitchProvider value="booth">
          <PhotoBoothWorld {...worldProps} />
        </WorldSwitchProvider>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: switchName('booth') });
    const group = screen.getByRole('group', {
      name: worldsCopy.booth.styleLabel,
    });
    const row = link.parentElement;
    expect(row?.contains(group)).toBe(false);
    expect(row?.nextElementSibling).toBe(group);
  });
});
