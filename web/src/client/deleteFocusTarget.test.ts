import {
  deleteFocusTarget,
  deleteFocusTargetFromInfiniteData,
} from './deleteFocusTarget';

describe('deleteFocusTarget', () => {
  const items = [{ id: 'previous' }, { id: 'deleted' }, { id: 'successor' }];

  it('prefers the successor', () => {
    expect(deleteFocusTarget(items, 'deleted')).toEqual({
      kind: 'item',
      id: 'successor',
    });
  });

  it('falls back to the predecessor and then the create action', () => {
    expect(deleteFocusTarget(items.slice(0, 2), 'deleted')).toEqual({
      kind: 'item',
      id: 'previous',
    });
    expect(deleteFocusTarget([{ id: 'deleted' }], 'deleted')).toEqual({
      kind: 'create',
    });
  });

  it('preserves page order across loaded infinite-query pages', () => {
    expect(
      deleteFocusTargetFromInfiniteData(
        {
          pages: [{ items: items.slice(0, 2) }, { items: items.slice(2) }],
        },
        'deleted',
      ),
    ).toEqual({ kind: 'item', id: 'successor' });
  });
});
