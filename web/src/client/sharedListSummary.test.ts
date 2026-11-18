import { describe, expect, it } from 'vitest';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { personRoleResolver } from './personColours';
import {
  knownPersonName,
  listPeople,
  summarizeSharedList,
} from './sharedListSummary';

const AT = new Date('2026-11-14T10:00:00Z');
const anna = { id: 'anna', displayName: 'Anna' };
const ben = { id: 'ben', displayName: 'Ben' };

function item(
  id: string,
  overrides: Partial<CollectionItemDetail> = {},
): CollectionItemDetail {
  return {
    id,
    collectionId: 'list-1',
    createdBy: 'anna',
    title: id,
    quantity: null,
    completed: false,
    completedBy: null,
    completedAt: null,
    position: 0,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    creator: anna,
    completer: null,
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    ...overrides,
  };
}

const roleOf = personRoleResolver('anna');

const done = (id: string, by: typeof anna) =>
  item(id, { completed: true, completedBy: by.id, completer: by });

describe('summarizeSharedList', () => {
  it('counts open and finished entries', () => {
    const summary = summarizeSharedList(
      [item('a'), item('b'), done('c', ben)],
      roleOf,
    );
    expect(summary).toMatchObject({ total: 3, open: 2, done: 1 });
  });

  it('splits the finished entries by the person who finished them, you first', () => {
    const summary = summarizeSharedList(
      [done('1', ben), done('2', anna), done('3', ben), item('4')],
      roleOf,
    );
    expect(summary.shares).toEqual([
      { personId: 'anna', displayName: 'Anna', role: 'own', count: 1 },
      { personId: 'ben', displayName: 'Ben', role: 'partner', count: 2 },
    ]);
  });

  it('counts an entry finished before actors were recorded without giving it to anyone', () => {
    const summary = summarizeSharedList(
      [item('1', { completed: true }), done('2', ben)],
      roleOf,
    );
    expect(summary.done).toBe(2);
    expect(summary.shares.map((share) => share.count)).toEqual([1]);
  });

  it('has nothing to show for an empty list', () => {
    expect(summarizeSharedList([], roleOf)).toEqual({
      total: 0,
      open: 0,
      done: 0,
      shares: [],
    });
  });
});

describe('knownPersonName', () => {
  const list = {
    createdBy: 'anna',
    creator: anna,
    items: [item('1', { creator: ben }), done('2', ben)],
  } as unknown as CollectionDetail;

  it('finds a name from the list creator or from its entries', () => {
    expect(knownPersonName(list, 'anna')).toBe('Anna');
    expect(knownPersonName(list, 'ben')).toBe('Ben');
  });

  it('is empty when the list has not seen the person yet', () => {
    expect(knownPersonName(list, 'carla')).toBe('');
    expect(knownPersonName(list, undefined)).toBe('');
  });
});

describe('listPeople (#1808)', () => {
  const list = { creator: anna };

  it('knows the creator before anyone has touched the list', () => {
    expect(listPeople(list, [], roleOf)).toEqual([
      { personId: 'anna', displayName: 'Anna', role: 'own' },
    ]);
  });

  it('adds the partner as soon as they added or completed an entry, you first', () => {
    const people = listPeople(
      list,
      [item('milk', { createdBy: 'ben', creator: ben }), done('bread', ben)],
      roleOf,
    );
    expect(people.map((person) => [person.displayName, person.role])).toEqual([
      ['Anna', 'own'],
      ['Ben', 'partner'],
    ]);
  });

  it('lists each person once, however many entries they touched', () => {
    const people = listPeople(
      list,
      [
        done('a', anna),
        done('b', anna),
        item('c', { createdBy: 'ben', creator: ben }),
        done('d', ben),
      ],
      roleOf,
    );
    expect(people).toHaveLength(2);
  });

  it('gives the viewer their own role and everybody else the partner role', () => {
    const asSeenByBen = listPeople(list, [done('x', ben)], roleOf);
    const asSeenByAnna = listPeople(list, [done('x', ben)], roleOf);
    expect(asSeenByBen).toEqual(asSeenByAnna);
    expect(asSeenByBen.find((person) => person.personId === 'ben')?.role).toBe(
      'partner',
    );
  });

  it('skips a person without a readable name instead of showing an empty disc', () => {
    const people = listPeople(
      list,
      [
        item('ghost', {
          createdBy: 'gone',
          creator: { id: 'gone', displayName: '  ' },
        }),
      ],
      roleOf,
    );
    expect(people.map((person) => person.personId)).toEqual(['anna']);
  });
});
