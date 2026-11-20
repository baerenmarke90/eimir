// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListItemReorder } from './ListEntryActions';

type ReorderResult = boolean | undefined;
type ReorderCallback = (itemIds: string[], movedId: string) => ReorderResult;

function SortableList({
  itemIds,
  onReorder,
}: {
  itemIds: readonly string[];
  onReorder: ReorderCallback;
}) {
  const reorder = useListItemReorder({ itemIds, disabled: false, onReorder });
  return (
    <ul>
      {reorder.orderedItemIds.map((id) => (
        <li key={id} data-sortable-item-id={id}>
          <button type="button" {...reorder.handleProps(id)}>
            {`move ${id}`}
          </button>
        </li>
      ))}
    </ul>
  );
}

function renderedOrder(): (string | undefined)[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-sortable-item-id]'),
  ).map((row) => row.dataset.sortableItemId);
}

const ROW_HEIGHT = 40;

beforeEach(() => {
  // jsdom has no layout or pointer capture; give each row a stable slot.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const row = this.closest<HTMLElement>('[data-sortable-item-id]');
      const index = row
        ? Array.from(row.parentElement?.children ?? []).indexOf(row)
        : 0;
      return DOMRect.fromRect({
        x: 0,
        y: index * ROW_HEIGHT,
        width: 300,
        height: ROW_HEIGHT,
      });
    },
  );
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useListItemReorder rapid moves (#1687)', () => {
  it('starts a second keyboard move from the first accepted order before it renders', () => {
    const onReorder = vi.fn<ReorderCallback>(() => true);
    render(
      <SortableList itemIds={['a', 'b', 'c', 'd']} onReorder={onReorder} />,
    );
    const handle = screen.getByRole('button', { name: 'move a' });

    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });

    expect(onReorder.mock.calls.map(([order]) => order)).toEqual([
      ['b', 'a', 'c', 'd'],
      ['b', 'c', 'a', 'd'],
    ]);
    expect(renderedOrder()).toEqual(['b', 'c', 'a', 'd']);
  });

  it('keeps the rendered order as the base when the caller declines a move', () => {
    const onReorder = vi.fn<ReorderCallback>(() => undefined);
    render(<SortableList itemIds={['a', 'b', 'c']} onReorder={onReorder} />);
    const handle = screen.getByRole('button', { name: 'move a' });

    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });

    expect(onReorder.mock.calls.map(([order]) => order)).toEqual([
      ['b', 'a', 'c'],
      ['b', 'a', 'c'],
    ]);
    expect(renderedOrder()).toEqual(['a', 'b', 'c']);
  });

  it('drops pending moves when an order that matches no request arrives', () => {
    const onReorder = vi.fn<ReorderCallback>(() => true);
    const view = render(
      <SortableList itemIds={['a', 'b', 'c']} onReorder={onReorder} />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'move a' }), {
      key: 'ArrowDown',
    });
    expect(renderedOrder()).toEqual(['b', 'a', 'c']);

    // For example, a failed save restored the authoritative order.
    view.rerender(
      <SortableList itemIds={['c', 'a', 'b']} onReorder={onReorder} />,
    );
    expect(renderedOrder()).toEqual(['c', 'a', 'b']);

    fireEvent.keyDown(screen.getByRole('button', { name: 'move c' }), {
      key: 'ArrowDown',
    });
    expect(onReorder.mock.calls.at(-1)?.[0]).toEqual(['a', 'c', 'b']);
  });

  it('keeps a later pending move visible while an earlier one is confirmed', () => {
    const onReorder = vi.fn<ReorderCallback>(() => true);
    const view = render(
      <SortableList itemIds={['a', 'b', 'c']} onReorder={onReorder} />,
    );
    const handle = screen.getByRole('button', { name: 'move a' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });

    view.rerender(
      <SortableList itemIds={['b', 'a', 'c']} onReorder={onReorder} />,
    );
    expect(renderedOrder()).toEqual(['b', 'c', 'a']);

    view.rerender(
      <SortableList itemIds={['b', 'c', 'a']} onReorder={onReorder} />,
    );
    expect(renderedOrder()).toEqual(['b', 'c', 'a']);
    fireEvent.keyDown(screen.getByRole('button', { name: 'move a' }), {
      key: 'ArrowUp',
    });
    expect(onReorder.mock.calls.at(-1)?.[0]).toEqual(['b', 'a', 'c']);
  });

  it('starts a keyboard move right after a drag from the dropped order', () => {
    const onReorder = vi.fn<ReorderCallback>(() => true);
    render(
      <SortableList itemIds={['a', 'b', 'c', 'd']} onReorder={onReorder} />,
    );
    const dragged = screen.getByRole('button', { name: 'move a' });

    act(() => {
      fireEvent.pointerDown(dragged, {
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: ROW_HEIGHT / 2,
      });
    });
    act(() => {
      fireEvent.pointerMove(dragged, {
        pointerId: 1,
        clientX: 10,
        clientY: ROW_HEIGHT / 2 + ROW_HEIGHT + 4,
      });
    });
    act(() => {
      fireEvent.pointerUp(dragged, { pointerId: 1 });
    });
    expect(onReorder.mock.calls.at(-1)?.[0]).toEqual(['b', 'a', 'c', 'd']);

    // The parent has not rendered the dropped order yet.
    fireEvent.keyDown(screen.getByRole('button', { name: 'move d' }), {
      key: 'ArrowUp',
    });
    expect(onReorder.mock.calls.at(-1)?.[0]).toEqual(['b', 'a', 'd', 'c']);
  });
});
