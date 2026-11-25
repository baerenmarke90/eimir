// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import copy from '../../i18n/locales/memoryWorlds';
import { entry } from './__fixtures__/stories';
import { StackWorld } from './StackWorld';

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

const entries = [
  entry('a', { isLead: true }),
  entry('b', { kind: 'heart', emotion: 'LOVED', title: 'Thank you' }),
  entry('c', { kind: 'milestone', title: 'Moved in together' }),
];

function renderStack(onOpen = vi.fn()) {
  render(
    <MemoryRouter>
      <StackWorld
        entries={entries}
        kicker="Two years ago today"
        loadMemoryImage={vi.fn()}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
  return onOpen;
}

function motionAllowed() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('StackWorld', () => {
  it('shows the top print as the one link, with the lead kicker', () => {
    renderStack();
    const pile = screen.getByRole('group', {
      name: copy.stack.label,
    });
    expect(pile.getAttribute('aria-roledescription')).toBe(
      copy.stack.roleDescription,
    );
    const link = screen.getByRole('link', {
      name: fill(copy.stack.open, { title: 'Title a' }),
    });
    expect(link.getAttribute('href')).toBe('/story/memories/a');
    expect(link.textContent).toContain('Two years ago today');
    // Only the top print is exposed; the others are part of the pile.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(
      screen.getByText(fill(copy.stack.position, { position: 1, count: 3 })),
    ).toBeTruthy();
  });

  it('opens the memory on tap and on Enter', async () => {
    const onOpen = renderStack(
      vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
    );
    const link = screen.getByRole('link', {
      name: fill(copy.stack.open, { title: 'Title a' }),
    });
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0].slice(1)).toEqual(['/story/memories/a', 'a']);

    const user = userEvent.setup();
    link.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('puts the top print to the back with the hidden next button', () => {
    renderStack();
    fireEvent.click(screen.getByRole('button', { name: copy.stack.next }));
    expect(
      screen.getByRole('link', {
        name: fill(copy.stack.open, { title: 'Thank you' }),
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(fill(copy.stack.position, { position: 2, count: 3 })),
    ).toBeTruthy();
    expect(screen.getByText(copy.stack.hint)).toBeTruthy();
  });

  it('lets the prints land before the pile can be browsed', () => {
    vi.useFakeTimers();
    motionAllowed();
    const onOpen = renderStack();
    const pile = screen.getByRole('group', {
      name: copy.stack.label,
    });
    expect(pile.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText(copy.stack.landing)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('link', {
        name: fill(copy.stack.open, { title: 'Title a' }),
      }),
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole('button', {
          name: copy.stack.next,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    act(() => {
      vi.runAllTimers();
    });
    expect(pile.getAttribute('aria-busy')).toBeNull();
    fireEvent.click(
      screen.getByRole('link', {
        name: fill(copy.stack.open, { title: 'Title a' }),
      }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without entries', () => {
    const { container } = render(
      <MemoryRouter>
        <StackWorld
          entries={[]}
          kicker=""
          loadMemoryImage={vi.fn()}
          onOpen={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });
});
