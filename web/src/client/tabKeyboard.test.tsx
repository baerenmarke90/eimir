// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { handleTabKeyDown } from './tabKeyboard';

afterEach(cleanup);

function tabs() {
  const select = vi.fn();
  render(
    <div role="tablist" onKeyDown={(event) => handleTabKeyDown(event, select)}>
      <button type="button" role="tab">
        <span>First</span>
      </button>
      <button type="button" role="tab" disabled>
        Disabled
      </button>
      <button type="button" role="tab" aria-disabled="true">
        Unavailable
      </button>
      <button type="button" role="tab" hidden>
        Hidden
      </button>
      <button type="button" role="tab">
        Last
      </button>
    </div>,
  );
  return {
    select,
    first: screen.getByRole('tab', { name: 'First' }),
    last: screen.getByRole('tab', { name: 'Last' }),
  };
}

it('follows event focus across consecutive keys without requiring a selected-state render', () => {
  const { select, first, last } = tabs();
  first.focus();
  fireEvent.keyDown(screen.getByText('First'), { key: 'ArrowRight' });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'ArrowLeft' });
  expect(document.activeElement).toBe(last);
  expect(select.mock.calls.map(([tab]) => tab)).toEqual([last, first, last]);
});

it('uses Home/End without repeating an already focused destination', () => {
  const { select, first, last } = tabs();
  first.focus();
  fireEvent.keyDown(first, { key: 'Home' });
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(first, { key: 'End' });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: 'Home' });
  expect(document.activeElement).toBe(first);
  expect(select).toHaveBeenCalledTimes(2);
});

it.each([
  { altKey: true },
  { ctrlKey: true },
  { metaKey: true },
  { isComposing: true },
])('leaves browser/IME shortcuts alone: %j', (modifiers) => {
  const { select, first } = tabs();
  first.focus();
  expect(fireEvent.keyDown(first, { key: 'ArrowRight', ...modifiers })).toBe(
    true,
  );
  expect(document.activeElement).toBe(first);
  expect(select).not.toHaveBeenCalled();
});

it('does not capture Tab or unrelated controls in a tablist', () => {
  const { select, first } = tabs();
  expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true);
  expect(
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' }),
  ).toBe(true);
  expect(select).not.toHaveBeenCalled();
});
