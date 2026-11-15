import { describe, expect, it } from 'vitest';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import {
  knownPersonName,
  listPeople,
  partnerTone,
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

const done = (id: string, by: typeof anna) =>
  item(id, { completed: true, completedBy: by.id, completer: by });

describe('partnerTone', () => {
  it('gives the creator of the list rose and everyone else blue', () => {
    expect(partnerTone({ createdBy: 'anna' }, 'anna')).toBe('a');
    expect(partnerTone({ createdBy: 'anna' }, 'ben')).toBe('b');
  });

  it('does not depend on who looks at the list', () => {
    const list = { createdBy: 'anna' };
    expect(partnerTone(list, 'ben')).toBe(partnerTone(list, 'ben'));
  });

  it('keeps a person who left blue or rose as before and treats unknown as blue', () => {
    expect(partnerTone({ createdBy: 'anna' }, null)).toBe('b');
    expect(partnerTone({ createdBy: 'anna' }, undefined)).toBe('b');
  });
});

describe('summarizeSharedList', () => {
  const list = { createdBy: 'anna' };

  it('counts open and finished entries', () => {
    const summary = summarizeSharedList(list, [
      item('a'),
      item('b'),
      done('c', ben),
    ]);
    expect(summary).toMatchObject({ total: 3, open: 2, done: 1 });
  });

  it('splits the finished entries by the person who finished them, rose first', () => {
    const summary = summarizeSharedList(list, [
      done('1', ben),
      done('2', anna),
      done('3', ben),
      item('4'),
    ]);
    expect(summary.shares).toEqual([
      { personId: 'anna', displayName: 'Anna', tone: 'a', count: 1 },
      { personId: 'ben', displayName: 'Ben', tone: 'b', count: 2 },
    ]);
  });

  it('counts an entry finished before actors were recorded without giving it to anyone', () => {
    const summary = summarizeSharedList(list, [
      item('1', { completed: true }),
      done('2', ben),
    ]);
    expect(summary.done).toBe(2);
    expect(summary.shares.map((share) => share.count)).toEqual([1]);
  });

  it('has nothing to show for an empty list', () => {
    expect(summarizeSharedList(list, [])).toEqual({
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
  const list = { createdBy: 'anna', creator: anna };

  it('knows the creator before anyone has touched the list', () => {
    expect(listPeople(list, [])).toEqual([
      { personId: 'anna', displayName: 'Anna', tone: 'a' },
    ]);
  });

  it('adds the partner as soon as they added or completed an entry, rose first', () => {
    const people = listPeople(list, [
      item('milk', { createdBy: 'ben', creator: ben }),
      done('bread', ben),
    ]);
    expect(people.map((person) => [person.displayName, person.tone])).toEqual([
      ['Anna', 'a'],
      ['Ben', 'b'],
    ]);
  });

  it('lists each person once, however many entries they touched', () => {
    const people = listPeople(list, [
      done('a', anna),
      done('b', anna),
      item('c', { createdBy: 'ben', creator: ben }),
      done('d', ben),
    ]);
    expect(people).toHaveLength(2);
  });

  it('keeps the same colours on both phones: the role belongs to the person', () => {
    const asSeenByBen = listPeople(list, [done('x', ben)]);
    const asSeenByAnna = listPeople(list, [done('x', ben)]);
    expect(asSeenByBen).toEqual(asSeenByAnna);
    expect(asSeenByBen.find((person) => person.personId === 'ben')?.tone).toBe(
      'b',
    );
  });

  it('skips a person without a readable name instead of showing an empty disc', () => {
    const people = listPeople(list, [
      item('ghost', {
        createdBy: 'gone',
        creator: { id: 'gone', displayName: '  ' },
      }),
    ]);
    expect(people.map((person) => person.personId)).toEqual(['anna']);
  });
});
