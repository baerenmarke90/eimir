import { describe, expect, it, vi } from 'vitest';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import {
  OUTBOX_ADD_MAX_AGE_MS,
  OUTBOX_MAX_OPS,
  OutboxFullError,
  applyOutbox,
  dropOps,
  emptyOutbox,
  enqueueAdd,
  enqueueSetCompleted,
  enqueueSetQuantity,
  isLocalItemId,
  newLocalItemId,
  parseOutbox,
  replayOutbox,
  settleOp,
  upsertConfirmedItem,
  type OutboxOp,
  type OutboxRecord,
  type OutboxStore,
  type OutboxTransport,
} from './collectionOutbox';
import { ClientProblemError } from './problemDetails';

const NOW = new Date('2026-11-14T10:00:00Z');
const ANNA = { id: 'anna', displayName: 'Anna' };
const VIEWER = { accountId: 'anna', creator: ANNA };

function item(
  overrides: Partial<CollectionItemDetail> = {},
): CollectionItemDetail {
  return {
    id: 'item-1',
    collectionId: 'list-1',
    createdBy: 'ben',
    title: 'Milch',
    quantity: null,
    completed: false,
    completedBy: null,
    completedAt: null,
    position: 0,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    creator: { id: 'ben', displayName: 'Ben' },
    completer: null,
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    ...overrides,
  };
}

function list(items: CollectionItemDetail[] = [item()]): CollectionDetail {
  return {
    id: 'list-1',
    spaceId: 'space-1',
    createdBy: 'ben',
    kind: 'SHOPPING',
    title: 'Einkauf',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    creator: { id: 'ben', displayName: 'Ben' },
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    items,
  };
}

let counter = 0;
const id = () => `op-${++counter}`;

function add(
  record: OutboxRecord,
  title: string,
  extra: Record<string, unknown> = {},
) {
  const opId = id();
  return enqueueAdd(record, {
    opId,
    idempotencyKey: `key-${opId}`,
    localId: newLocalItemId(opId),
    title,
    quantity: null,
    completed: false,
    now: NOW,
    ...extra,
  });
}

class MemoryOutbox implements OutboxStore {
  constructor(public record: OutboxRecord) {}
  peek() {
    return this.record.ops;
  }
  async settle(opId: string, named?: { localId: string; serverId: string }) {
    this.record = settleOp(this.record, opId, named);
  }
  async dropAll() {
    this.record = emptyOutbox();
  }
}

function problem(
  kind: ConstructorParameters<typeof ClientProblemError>[0],
  status?: number,
) {
  return new ClientProblemError(kind, status);
}

function transport(overrides: Partial<OutboxTransport> = {}): OutboxTransport {
  return {
    createItem: vi.fn(async (input) =>
      item({
        id: `server-${input.idempotencyKey}`,
        title: input.title,
        quantity: input.quantity,
      }),
    ),
    updateItem: vi.fn(async (input) =>
      item({
        id: input.itemId,
        version: input.version + 1,
        completed: input.completed ?? false,
        quantity: input.quantity ?? null,
      }),
    ),
    readCollection: vi.fn(async () => list()),
    ...overrides,
  };
}

function run(
  record: OutboxRecord,
  t: OutboxTransport,
  extra: {
    known?: (id: string) => CollectionItemDetail | undefined;
    now?: () => number;
  } = {},
) {
  const store = new MemoryOutbox(record);
  const onItem = vi.fn();
  const onCollection = vi.fn();
  const result = replayOutbox({
    collectionId: 'list-1',
    transport: t,
    store,
    known: extra.known ?? (() => undefined),
    onItem,
    onCollection,
    now: extra.now ?? (() => NOW.getTime()),
  });
  return { store, onItem, onCollection, result };
}

describe('queueing changes', () => {
  it('keeps adds in order and trims the title and quantity', () => {
    let record = add(emptyOutbox(), '  Hafermilch ', { quantity: ' 2 Pack ' });
    record = add(record, 'Tomaten');

    expect(record.ops.map((op) => (op.kind === 'add' ? op.title : ''))).toEqual(
      ['Hafermilch', 'Tomaten'],
    );
    expect((record.ops[0] as { quantity: string }).quantity).toBe('2 Pack');
  });

  it('folds a check of an item that is still waiting into its add', () => {
    const record = add(emptyOutbox(), 'Brot');
    const local = (record.ops[0] as { localId: string }).localId;

    const checked = enqueueSetCompleted(record, {
      opId: id(),
      itemId: local,
      completed: true,
      now: NOW,
    });

    expect(checked.ops).toHaveLength(1);
    expect((checked.ops[0] as { completed: boolean }).completed).toBe(true);
  });

  it('folds a quantity of an item that is still waiting into its add', () => {
    const record = add(emptyOutbox(), 'Brot');
    const local = (record.ops[0] as { localId: string }).localId;

    const changed = enqueueSetQuantity(record, {
      opId: id(),
      itemId: local,
      quantity: '3',
      now: NOW,
    });

    expect(changed.ops).toHaveLength(1);
    expect((changed.ops[0] as { quantity: string }).quantity).toBe('3');
  });

  it('sends one request for a quick check, uncheck and check again', () => {
    let record = emptyOutbox();
    for (const completed of [true, false, true]) {
      record = enqueueSetCompleted(record, {
        opId: id(),
        itemId: 'item-1',
        completed,
        now: NOW,
      });
    }

    expect(record.ops).toHaveLength(1);
    expect(record.ops[0]).toMatchObject({
      kind: 'setCompleted',
      itemId: 'item-1',
      completed: true,
    });
  });

  it('treats a blank quantity as none', () => {
    const record = enqueueSetQuantity(emptyOutbox(), {
      opId: id(),
      itemId: 'item-1',
      quantity: '   ',
      now: NOW,
    });

    expect(record.ops[0]).toMatchObject({
      kind: 'setQuantity',
      quantity: null,
    });
  });

  it('refuses more changes than the technical bound', () => {
    let record = emptyOutbox();
    for (let index = 0; index < OUTBOX_MAX_OPS; index++)
      record = add(record, `Eintrag ${index}`);

    expect(() => add(record, 'One too many')).toThrow(OutboxFullError);
  });

  it('names the item a waiting add became for the changes behind it', () => {
    const base = add(emptyOutbox(), 'Brot');
    const addOp = base.ops[0] as { opId: string; localId: string };
    const record: OutboxRecord = {
      ...base,
      ops: [
        ...base.ops,
        {
          kind: 'setQuantity',
          opId: id(),
          createdAt: NOW.toISOString(),
          itemId: addOp.localId,
          quantity: '2',
        },
      ],
    };

    const settled = settleOp(record, addOp.opId, {
      localId: addOp.localId,
      serverId: 'server-1',
    });

    expect(settled.ops).toHaveLength(1);
    expect(settled.ops[0]).toMatchObject({ itemId: 'server-1' });
  });
});

describe('reading a stored queue', () => {
  it('leaves out what it cannot understand instead of failing', () => {
    const good = add(emptyOutbox(), 'Milch');
    const parsed = parseOutbox({
      version: 1,
      ops: [
        ...good.ops,
        { kind: 'add' },
        'x',
        null,
        { kind: 'mystery', opId: 'a', createdAt: NOW.toISOString() },
      ],
    });

    expect(parsed.ops).toHaveLength(1);
  });

  it('starts empty for an unknown version or shape', () => {
    expect(parseOutbox(null).ops).toEqual([]);
    expect(parseOutbox({ version: 2, ops: [{}] }).ops).toEqual([]);
    expect(parseOutbox('nope').ops).toEqual([]);
  });

  it('round-trips what it writes', () => {
    let record = add(emptyOutbox(), 'Milch', { quantity: '1 l' });
    record = enqueueSetCompleted(record, {
      opId: id(),
      itemId: 'item-9',
      completed: true,
      now: NOW,
    });

    expect(parseOutbox(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });
});

describe('the list as shown', () => {
  it('shows a waiting add at the end as an item that is not on the server yet', () => {
    const record = add(emptyOutbox(), 'Hafermilch', { quantity: '2 Pack' });

    const view = applyOutbox(list(), record, VIEWER);

    expect(view.collection.items.map((entry) => entry.title)).toEqual([
      'Milch',
      'Hafermilch',
    ]);
    const created = view.collection.items[1];
    expect(created).toMatchObject({
      quantity: '2 Pack',
      completed: false,
      version: 0,
    });
    expect(isLocalItemId(created.id)).toBe(true);
    expect(view.pendingItemIds.has(created.id)).toBe(true);
  });

  it('shows a waiting check with the viewer as the one who completed it', () => {
    const record = enqueueSetCompleted(emptyOutbox(), {
      opId: id(),
      itemId: 'item-1',
      completed: true,
      now: NOW,
    });

    const view = applyOutbox(list(), record, VIEWER);

    expect(view.collection.items[0]).toMatchObject({
      completed: true,
      completedBy: 'anna',
    });
    expect(view.pendingItemIds.has('item-1')).toBe(true);
  });

  it('leaves the server copy untouched and ignores changes to unknown items', () => {
    const original = list();
    const record = enqueueSetCompleted(emptyOutbox(), {
      opId: id(),
      itemId: 'missing',
      completed: true,
      now: NOW,
    });

    const view = applyOutbox(original, record, VIEWER);

    expect(original.items[0].completed).toBe(false);
    expect(view.pendingItemIds.size).toBe(0);
  });

  it('returns the same list when nothing is waiting', () => {
    const original = list();

    expect(applyOutbox(original, emptyOutbox(), VIEWER).collection).toBe(
      original,
    );
  });

  it('replaces a confirmed item by id and adds a new one at the end', () => {
    const updated = upsertConfirmedItem(list(), item({ completed: true }));
    const grown = upsertConfirmedItem(
      updated,
      item({ id: 'item-2', title: 'Brot' }),
    );

    expect(updated.items[0].completed).toBe(true);
    expect(grown.items.map((entry) => entry.id)).toEqual(['item-1', 'item-2']);
  });
});

describe('sending the waiting changes', () => {
  it('sends them in order and names a new item before the changes that follow', async () => {
    const base = add(emptyOutbox(), 'Hafermilch');
    const addOp = base.ops[0] as { localId: string; idempotencyKey: string };
    const record: OutboxRecord = {
      ...base,
      ops: [
        ...base.ops,
        {
          kind: 'setQuantity',
          opId: id(),
          createdAt: NOW.toISOString(),
          itemId: addOp.localId,
          quantity: '2 Pack',
        },
      ],
    };
    const t = transport();

    const { store, result } = run(record, t);
    const outcome = await result;

    expect(outcome.status).toBe('done');
    expect(store.record.ops).toEqual([]);
    expect(t.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: addOp.idempotencyKey,
        title: 'Hafermilch',
      }),
    );
    expect(t.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: `server-${addOp.idempotencyKey}`,
        quantity: '2 Pack',
      }),
    );
  });

  it('sends the same request identity again after a failed attempt', async () => {
    const record = add(emptyOutbox(), 'Brot');
    const key = (record.ops[0] as { idempotencyKey: string }).idempotencyKey;
    const createItem = vi
      .fn()
      .mockRejectedValueOnce(problem('offline'))
      .mockResolvedValueOnce(item({ id: 'server-1' }));
    const t = transport({ createItem });

    const first = await run(record, t).result;
    const second = await run(record, t).result;

    expect(first.status).toBe('blocked');
    expect(second.status).toBe('done');
    expect(
      createItem.mock.calls.map(([input]) => input.idempotencyKey),
    ).toEqual([key, key]);
  });

  it('keeps everything and stops at the first change that cannot be sent yet', async () => {
    let record = add(emptyOutbox(), 'Brot');
    record = add(record, 'Butter');
    const t = transport({
      createItem: vi.fn().mockRejectedValue(problem('server', 503)),
    });

    const { store, result } = run(record, t);

    expect((await result).status).toBe('blocked');
    expect(store.record.ops).toHaveLength(2);
    expect(t.createItem).toHaveBeenCalledTimes(1);
  });

  it.each([
    'offline',
    'server',
    'rateLimit',
    'unauthorized',
    'permission',
    'unknown',
  ] as const)('keeps a change that failed with %s for later', async (kind) => {
    const record = enqueueSetCompleted(emptyOutbox(), {
      opId: id(),
      itemId: 'item-1',
      completed: true,
      now: NOW,
    });
    const t = transport({
      updateItem: vi.fn().mockRejectedValue(problem(kind)),
    });

    const { store, result } = run(record, t, { known: () => item() });

    expect((await result).status).toBe('blocked');
    expect(store.record.ops).toHaveLength(1);
  });

  it('does not send a value the item already has', async () => {
    const record = enqueueSetCompleted(emptyOutbox(), {
      opId: id(),
      itemId: 'item-1',
      completed: true,
      now: NOW,
    });
    const t = transport();

    const { store, result } = run(record, t, {
      known: () => item({ completed: true }),
    });

    expect((await result).outcomes).toEqual([
      expect.objectContaining({ kind: 'sent' }),
    ]);
    expect(t.updateItem).not.toHaveBeenCalled();
    expect(store.record.ops).toEqual([]);
  });

  it('sets the wanted value on top of a newer version after a conflict', async () => {
    const record = enqueueSetCompleted(emptyOutbox(), {
      opId: id(),
      itemId: 'item-1',
      completed: true,
      now: NOW,
    });
    const updateItem = vi
      .fn()
      .mockRejectedValueOnce(problem('conflict', 409))
      .mockResolvedValueOnce(item({ version: 6, completed: true }));
    const t = transport({
      updateItem,
      readCollection: vi.fn(async () =>
        list([item({ version: 5, title: 'Milch (neu)' })]),
      ),
    });

    const { store, result, onCollection } = run(record, t, {
      known: () => item({ version: 1 }),
    });

    expect((await result).status).toBe('done');
    expect(updateItem.mock.calls.map(([input]) => input.version)).toEqual([
      1, 5,
    ]);
    expect(onCollection).toHaveBeenCalledTimes(1);
    expect(store.record.ops).toEqual([]);
  });

  it('does nothing when the newer version already has the wanted value', async () => {
    const record = enqueueSetCompleted(emptyOutbox(), {
      opId: id(),
      itemId: 'item-1',
      completed: true,
      now: NOW,
    });
    const updateItem = vi.fn().mockRejectedValueOnce(problem('conflict', 409));
    const t = transport({
      updateItem,
      readCollection: vi.fn(async () =>
        list([item({ version: 5, completed: true })]),
      ),
    });

    const { result } = run(record, t, { known: () => item() });

    expect((await result).status).toBe('done');
    expect(updateItem).toHaveBeenCalledTimes(1);
  });

  it('keeps the change when the item keeps changing', async () => {
    const record = enqueueSetCompleted(emptyOutbox(), {
      opId: id(),
      itemId: 'item-1',
      completed: true,
      now: NOW,
    });
    const t = transport({
      updateItem: vi.fn().mockRejectedValue(problem('conflict', 409)),
      readCollection: vi.fn(async () => list([item({ version: 9 })])),
    });

    const { store, result } = run(record, t, { known: () => item() });

    expect((await result).status).toBe('blocked');
    expect(store.record.ops).toHaveLength(1);
  });

  it('drops a change to an item the partner deleted and goes on', async () => {
    let record = enqueueSetCompleted(emptyOutbox(), {
      opId: id(),
      itemId: 'item-1',
      completed: true,
      now: NOW,
    });
    record = enqueueSetCompleted(record, {
      opId: id(),
      itemId: 'item-2',
      completed: true,
      now: NOW,
    });
    const updateItem = vi
      .fn()
      .mockRejectedValueOnce(problem('notFound', 404))
      .mockResolvedValueOnce(item({ id: 'item-2', completed: true }));
    const t = transport({
      updateItem,
      readCollection: vi.fn(async () => list([item({ id: 'item-2' })])),
    });

    const { store, result } = run(record, t, {
      known: (itemId) => item({ id: itemId }),
    });
    const outcome = await result;

    expect(outcome.status).toBe('done');
    expect(outcome.outcomes[0]).toMatchObject({
      kind: 'dropped',
      reason: 'itemGone',
    });
    expect(outcome.outcomes[1]).toMatchObject({ kind: 'sent' });
    expect(store.record.ops).toEqual([]);
  });

  it('drops everything when the list itself is gone', async () => {
    let record = add(emptyOutbox(), 'Brot');
    record = add(record, 'Butter');
    const t = transport({
      createItem: vi.fn().mockRejectedValue(problem('notFound', 404)),
    });

    const { store, result } = run(record, t);
    const outcome = await result;

    expect(outcome.status).toBe('done');
    expect(outcome.outcomes).toEqual([
      expect.objectContaining({ kind: 'dropped', reason: 'collectionGone' }),
    ]);
    expect(store.record.ops).toEqual([]);
  });

  it('drops an add the server refuses and goes on with the next', async () => {
    let record = add(emptyOutbox(), 'Brot');
    record = add(record, 'Butter');
    const createItem = vi
      .fn()
      .mockRejectedValueOnce(problem('validation', 422))
      .mockResolvedValueOnce(item({ id: 'server-2', title: 'Butter' }));
    const t = transport({ createItem });

    const { store, result } = run(record, t);
    const outcome = await result;

    expect(outcome.outcomes[0]).toMatchObject({
      kind: 'dropped',
      reason: 'rejected',
    });
    expect(outcome.outcomes[1]).toMatchObject({ kind: 'sent' });
    expect(store.record.ops).toEqual([]);
  });

  it('does not send an add that waited longer than a request identity may be replayed', async () => {
    const record = add(emptyOutbox(), 'Alt');
    const t = transport();
    const later = NOW.getTime() + OUTBOX_ADD_MAX_AGE_MS + 1;

    const { store, result } = run(record, t, { now: () => later });
    const outcome = await result;

    expect(outcome.outcomes[0]).toMatchObject({
      kind: 'dropped',
      reason: 'expired',
    });
    expect(t.createItem).not.toHaveBeenCalled();
    expect(store.record.ops).toEqual([]);
  });

  it('still sends an add that waited just under the limit', async () => {
    const record = add(emptyOutbox(), 'Fast zu alt');
    const t = transport();
    const later = NOW.getTime() + OUTBOX_ADD_MAX_AGE_MS;

    const { result } = run(record, t, { now: () => later });

    expect((await result).outcomes[0]).toMatchObject({ kind: 'sent' });
    expect(t.createItem).toHaveBeenCalledTimes(1);
  });

  it('drops the changes behind an add that expired because the item never existed', async () => {
    const base = add(emptyOutbox(), 'Alt');
    const addOp = base.ops[0] as { localId: string };
    const record: OutboxRecord = {
      ...base,
      ops: [
        ...base.ops,
        {
          kind: 'setQuantity',
          opId: id(),
          createdAt: NOW.toISOString(),
          itemId: addOp.localId,
          quantity: '2',
        },
      ],
    };
    const t = transport();
    const later = NOW.getTime() + OUTBOX_ADD_MAX_AGE_MS + 1;

    const { store, result } = run(record, t, { now: () => later });
    const outcome = await result;

    expect(
      outcome.outcomes.map((entry) =>
        entry.kind === 'dropped' ? entry.reason : entry.kind,
      ),
    ).toEqual(['expired', 'orphaned']);
    expect(t.updateItem).not.toHaveBeenCalled();
    expect(store.record.ops).toEqual([]);
  });

  it('reports each confirmed item so the cached list can be updated at once', async () => {
    const record = add(emptyOutbox(), 'Brot');

    const { onItem, result } = run(record, transport());
    await result;

    expect(onItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Brot' }),
    );
  });

  it('keeps changes queued while it runs and does not lose them', async () => {
    const record = add(emptyOutbox(), 'Brot');
    const store = new MemoryOutbox(record);
    let arrived = false;
    const t = transport({
      createItem: vi.fn(async () => {
        // One new change arrives while the first request is on its way.
        if (!arrived) {
          arrived = true;
          store.record = add(store.record, 'Butter');
        }
        return item({ id: 'server-1' });
      }),
    });

    const result = await replayOutbox({
      collectionId: 'list-1',
      transport: t,
      store,
      known: () => undefined,
      onItem: vi.fn(),
      onCollection: vi.fn(),
      now: () => NOW.getTime(),
    });

    expect(result.status).toBe('done');
    expect(t.createItem).toHaveBeenCalledTimes(2);
    expect(store.record.ops).toEqual([]);
  });

  it('can drop a chosen set of changes', () => {
    let record = add(emptyOutbox(), 'A');
    record = add(record, 'B');
    const first = (record.ops[0] as OutboxOp).opId;

    expect(dropOps(record, [first]).ops).toHaveLength(1);
  });
});
