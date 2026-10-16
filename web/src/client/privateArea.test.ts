import { describe, expect, it } from 'vitest';
import {
  movePrivateCollectionItem,
  PRIVATE_AREA_ROOT_PATH,
  PRIVATE_COLLECTIONS_PATH,
  PRIVATE_GIFT_IDEAS_PATH,
  PRIVATE_NOTES_PATH,
  privateAreaQueryKeys,
  privateCollectionPath,
  privateGiftIdeaPath,
  privateNotePath,
} from './privateArea';

describe('private area client boundary', () => {
  it('keeps the private hub separate from its three resource namespaces', () => {
    expect(PRIVATE_AREA_ROOT_PATH).toBe('/more/private');
    expect([
      PRIVATE_NOTES_PATH,
      PRIVATE_GIFT_IDEAS_PATH,
      PRIVATE_COLLECTIONS_PATH,
    ]).toEqual([
      '/more/private/notes',
      '/more/private/gift-ideas',
      '/more/private/collections',
    ]);
  });

  it('binds every private query root to account, space and owner context', () => {
    expect(privateAreaQueryKeys.root('account-a', 'space-a')).toEqual([
      'm5-s4-private',
      'account-a',
      'space-a',
      'owner',
      'account-a',
    ]);
    expect(privateAreaQueryKeys.notes('account-a', 'space-a')).not.toEqual(
      privateAreaQueryKeys.notes('account-b', 'space-a'),
    );
    expect(
      privateAreaQueryKeys.collections('account-a', 'space-a'),
    ).not.toEqual(privateAreaQueryKeys.collections('account-a', 'space-b'));
  });

  it('keeps private resource identifiers in the personal route namespace', () => {
    expect(privateNotePath('note/one')).toBe('/more/private/notes/note%2Fone');
    expect(privateGiftIdeaPath('gift one')).toBe(
      '/more/private/gift-ideas/gift%20one',
    );
    expect(privateCollectionPath('list#one')).toBe(
      '/more/private/collections/list%23one',
    );
  });

  it('builds an exact-set collection reorder without adding or dropping ids', () => {
    expect(movePrivateCollectionItem(['a', 'b', 'c'], 'b', -1)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(movePrivateCollectionItem(['a', 'b', 'c'], 'b', 1)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(movePrivateCollectionItem(['a', 'b', 'c'], 'a', -1)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
