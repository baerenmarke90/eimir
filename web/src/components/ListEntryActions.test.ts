import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ListEntryIconButton,
  moveSortableItem,
  moveSortableItemByOffset,
} from './ListEntryActions';

describe('list entry reorder helpers', () => {
  it('moves an item before another item', () => {
    expect(moveSortableItem(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('moves an item after another item', () => {
    expect(moveSortableItem(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('keeps the order unchanged for unknown ids', () => {
    expect(moveSortableItem(['a', 'b'], 'missing', 'a', 'before')).toEqual([
      'a',
      'b',
    ]);
  });

  it('supports one-step keyboard movement', () => {
    expect(moveSortableItemByOffset(['a', 'b', 'c'], 'b', -1)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(moveSortableItemByOffset(['a', 'b', 'c'], 'b', 1)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('does not move beyond list boundaries', () => {
    expect(moveSortableItemByOffset(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moveSortableItemByOffset(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
  });

  it('uses the provided label as the icon button accessible name', () => {
    const html = renderToStaticMarkup(
      createElement(ListEntryIconButton, {
        icon: 'edit',
        label: 'Bearbeiten',
      }),
    );

    expect(html).toContain('aria-label="Bearbeiten"');
    expect(html).toContain('title="Bearbeiten"');
    expect(html).not.toContain('aria-label="common.edit"');
  });
});
