/**
 * Changes to a shopping list that are waiting to be sent (#1808, step B2).
 *
 * A shopping list is used in a store with weak reception, so adding, checking,
 * unchecking and changing the quantity of an item are kept on the device and
 * sent later. This module holds the pure rules: what a queued change looks like,
 * how queued changes are merged into the list that is shown, how they are
 * folded together, and the replay that sends them in order.
 *
 * Replay is safe to repeat. A queued add carries one request identity
 * (`Idempotency-Key`, decision 0015), so sending it twice returns the original
 * item. Every other change sets a value, so repeating it cannot do harm and an
 * item that already has the wanted value is not sent at all.
 */
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { normalizeClientError } from './problemDetails';

export const OUTBOX_VERSION = 1;
/** A create key is replayed for at most half of the server retention (decision 0012/0015). */
export const OUTBOX_ADD_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Technical bound so a runaway client cannot fill the device store. */
export const OUTBOX_MAX_OPS = 200;
export const OUTBOX_QUANTITY_MAX_LENGTH = 40;
const LOCAL_ID_PREFIX = 'local-';

interface OutboxOpBase {
  /** Names this queued change inside the queue; never sent to the server. */
  opId: string;
  createdAt: string;
}

export interface OutboxAddOp extends OutboxOpBase {
  kind: 'add';
  /** The request identity sent with the create; kept so a repeat returns the same item. */
  idempotencyKey: string;
  /** Stands for the item until the server has named it. */
  localId: string;
  title: string;
  quantity: string | null;
  completed: boolean;
}

export interface OutboxSetCompletedOp extends OutboxOpBase {
  kind: 'setCompleted';
  /** A server item id, or the `localId` of an add that is still waiting. */
  itemId: string;
  completed: boolean;
}

export interface OutboxSetQuantityOp extends OutboxOpBase {
  kind: 'setQuantity';
  itemId: string;
  quantity: string | null;
}

export type OutboxOp = OutboxAddOp | OutboxSetCompletedOp | OutboxSetQuantityOp;

export interface OutboxRecord {
  version: typeof OUTBOX_VERSION;
  ops: OutboxOp[];
}

export function emptyOutbox(): OutboxRecord {
  return { version: OUTBOX_VERSION, ops: [] };
}

export function isLocalItemId(itemId: string): boolean {
  return itemId.startsWith(LOCAL_ID_PREFIX);
}

export function newLocalItemId(uuid: string): string {
  return `${LOCAL_ID_PREFIX}${uuid}`;
}

/** Trim a free-text quantity the way the server does; blank means none. */
export function normalizeQuantity(
  value: string | null | undefined,
): string | null {
  const cleaned = value?.trim() ?? '';
  if (!cleaned) return null;
  return cleaned.slice(0, OUTBOX_QUANTITY_MAX_LENGTH);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseOp(value: unknown): OutboxOp | null {
  if (!value || typeof value !== 'object') return null;
  const op = value as Record<string, unknown>;
  if (!isString(op.opId) || !isString(op.createdAt)) return null;
  if (!Number.isFinite(Date.parse(op.createdAt))) return null;
  const quantity =
    op.quantity === null || typeof op.quantity === 'string'
      ? (op.quantity as string | null)
      : undefined;
  if (op.kind === 'add') {
    if (
      !isString(op.idempotencyKey) ||
      !isString(op.localId) ||
      !isString(op.title) ||
      quantity === undefined ||
      typeof op.completed !== 'boolean'
    )
      return null;
    return {
      kind: 'add',
      opId: op.opId,
      createdAt: op.createdAt,
      idempotencyKey: op.idempotencyKey,
      localId: op.localId,
      title: op.title,
      quantity,
      completed: op.completed,
    };
  }
  if (op.kind === 'setCompleted') {
    if (!isString(op.itemId) || typeof op.completed !== 'boolean') return null;
    return {
      kind: 'setCompleted',
      opId: op.opId,
      createdAt: op.createdAt,
      itemId: op.itemId,
      completed: op.completed,
    };
  }
  if (op.kind === 'setQuantity') {
    if (!isString(op.itemId) || quantity === undefined) return null;
    return {
      kind: 'setQuantity',
      opId: op.opId,
      createdAt: op.createdAt,
      itemId: op.itemId,
      quantity,
    };
  }
  return null;
}

/** Read a stored queue defensively; anything it cannot understand is left out. */
export function parseOutbox(payload: unknown): OutboxRecord {
  if (!payload || typeof payload !== 'object') return emptyOutbox();
  const candidate = payload as { version?: unknown; ops?: unknown };
  if (candidate.version !== OUTBOX_VERSION || !Array.isArray(candidate.ops))
    return emptyOutbox();
  const ops: OutboxOp[] = [];
  for (const value of candidate.ops.slice(0, OUTBOX_MAX_OPS)) {
    const op = parseOp(value);
    if (op) ops.push(op);
  }
  return { version: OUTBOX_VERSION, ops };
}

export class OutboxFullError extends Error {
  constructor() {
    super('Too many changes are waiting to be sent.');
  }
}

function withOps(_record: OutboxRecord, ops: OutboxOp[]): OutboxRecord {
  return { version: OUTBOX_VERSION, ops };
}

export function enqueueAdd(
  record: OutboxRecord,
  input: {
    opId: string;
    idempotencyKey: string;
    localId: string;
    title: string;
    quantity: string | null;
    completed: boolean;
    now: Date;
  },
): OutboxRecord {
  if (record.ops.length >= OUTBOX_MAX_OPS) throw new OutboxFullError();
  const op: OutboxAddOp = {
    kind: 'add',
    opId: input.opId,
    createdAt: input.now.toISOString(),
    idempotencyKey: input.idempotencyKey,
    localId: input.localId,
    title: input.title.trim(),
    quantity: normalizeQuantity(input.quantity),
    completed: input.completed,
  };
  return withOps(record, [...record.ops, op]);
}

/**
 * Queue "set completed". A change to an item whose add is still waiting is
 * folded into that add, and an earlier completion change of the same item is
 * replaced, so a quick check/uncheck/check sends one request, not three.
 */
export function enqueueSetCompleted(
  record: OutboxRecord,
  input: { opId: string; itemId: string; completed: boolean; now: Date },
): OutboxRecord {
  const pendingAdd = record.ops.find(
    (op): op is OutboxAddOp => op.kind === 'add' && op.localId === input.itemId,
  );
  if (pendingAdd) {
    return withOps(
      record,
      record.ops.map((op) =>
        op === pendingAdd ? { ...pendingAdd, completed: input.completed } : op,
      ),
    );
  }
  const kept = record.ops.filter(
    (op) => !(op.kind === 'setCompleted' && op.itemId === input.itemId),
  );
  if (kept.length >= OUTBOX_MAX_OPS) throw new OutboxFullError();
  return withOps(record, [
    ...kept,
    {
      kind: 'setCompleted',
      opId: input.opId,
      createdAt: input.now.toISOString(),
      itemId: input.itemId,
      completed: input.completed,
    },
  ]);
}

export function enqueueSetQuantity(
  record: OutboxRecord,
  input: {
    opId: string;
    itemId: string;
    quantity: string | null;
    now: Date;
  },
): OutboxRecord {
  const quantity = normalizeQuantity(input.quantity);
  const pendingAdd = record.ops.find(
    (op): op is OutboxAddOp => op.kind === 'add' && op.localId === input.itemId,
  );
  if (pendingAdd) {
    return withOps(
      record,
      record.ops.map((op) =>
        op === pendingAdd ? { ...pendingAdd, quantity } : op,
      ),
    );
  }
  const kept = record.ops.filter(
    (op) => !(op.kind === 'setQuantity' && op.itemId === input.itemId),
  );
  if (kept.length >= OUTBOX_MAX_OPS) throw new OutboxFullError();
  return withOps(record, [
    ...kept,
    {
      kind: 'setQuantity',
      opId: input.opId,
      createdAt: input.now.toISOString(),
      itemId: input.itemId,
      quantity,
    },
  ]);
}

/** Remove one delivered change; the item a waiting add became is named for later changes. */
export function settleOp(
  record: OutboxRecord,
  opId: string,
  named?: { localId: string; serverId: string },
): OutboxRecord {
  const ops = record.ops
    .filter((op) => op.opId !== opId)
    .map((op) =>
      named && 'itemId' in op && op.itemId === named.localId
        ? { ...op, itemId: named.serverId }
        : op,
    );
  return withOps(record, ops);
}

export function dropOps(
  record: OutboxRecord,
  opIds: Iterable<string>,
): OutboxRecord {
  const drop = new Set(opIds);
  return withOps(
    record,
    record.ops.filter((op) => !drop.has(op.opId)),
  );
}

export interface OutboxViewer {
  accountId: string;
  creator: CollectionItemDetail['creator'];
}

/** The list as the person sees it: the server's items with the waiting changes applied. */
export function applyOutbox(
  collection: CollectionDetail,
  record: OutboxRecord,
  viewer: OutboxViewer,
  /**
   * Waiting adds the server has already confirmed, by local id to server id.
   * The confirmed item is in `collection`, so its waiting copy must not be
   * shown next to it while the queue still holds the op.
   */
  confirmed: ReadonlyMap<string, string> = new Map(),
): { collection: CollectionDetail; pendingItemIds: ReadonlySet<string> } {
  if (record.ops.length === 0) return { collection, pendingItemIds: new Set() };
  const items = collection.items.map((item) => ({ ...item }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const pending = new Set<string>();
  let nextPosition =
    items.reduce((highest, item) => Math.max(highest, item.position), -1) + 1;
  for (const op of record.ops) {
    if (op.kind === 'add') {
      if (confirmed.has(op.localId)) continue;
      const created: CollectionItemDetail = {
        id: op.localId,
        collectionId: collection.id,
        createdBy: viewer.accountId,
        title: op.title,
        quantity: op.quantity,
        completed: op.completed,
        completedBy: op.completed ? viewer.accountId : null,
        completedAt: op.completed ? new Date(op.createdAt) : null,
        position: nextPosition++,
        version: 0,
        createdAt: new Date(op.createdAt),
        updatedAt: new Date(op.createdAt),
        creator: viewer.creator,
        completer: op.completed ? viewer.creator : null,
        capabilities: { canEdit: true, canDelete: false, canComment: false },
      };
      items.push(created);
      byId.set(created.id, created);
      pending.add(created.id);
      continue;
    }
    const target = byId.get(confirmed.get(op.itemId) ?? op.itemId);
    if (!target) continue;
    pending.add(target.id);
    if (op.kind === 'setCompleted') {
      target.completed = op.completed;
      target.completedBy = op.completed ? viewer.accountId : null;
      target.completedAt = op.completed ? new Date(op.createdAt) : null;
      target.completer = op.completed ? viewer.creator : null;
    } else {
      target.quantity = op.quantity;
    }
  }
  return { collection: { ...collection, items }, pendingItemIds: pending };
}

/** Put an item the server just confirmed into the cached list, replacing it by id. */
export function upsertConfirmedItem(
  collection: CollectionDetail,
  item: CollectionItemDetail,
): CollectionDetail {
  const index = collection.items.findIndex((entry) => entry.id === item.id);
  const items =
    index >= 0
      ? collection.items.map((entry) => (entry.id === item.id ? item : entry))
      : [...collection.items, item];
  return { ...collection, items };
}

export type OutboxDropReason =
  | 'expired'
  | 'rejected'
  | 'itemGone'
  | 'collectionGone'
  | 'orphaned';

export type OutboxOutcome =
  | { kind: 'sent'; op: OutboxOp }
  | { kind: 'dropped'; op: OutboxOp; reason: OutboxDropReason };

export interface OutboxTransport {
  createItem(input: {
    collectionId: string;
    idempotencyKey: string;
    title: string;
    quantity: string | null;
    completed: boolean;
  }): Promise<CollectionItemDetail>;
  updateItem(input: {
    collectionId: string;
    itemId: string;
    version: number;
    completed?: boolean;
    quantity?: string | null;
  }): Promise<CollectionItemDetail>;
  readCollection(collectionId: string): Promise<CollectionDetail>;
}

/** The queue as the replay sees it; the owner serializes changes to it. */
export interface OutboxStore {
  peek(): readonly OutboxOp[];
  settle(
    opId: string,
    named?: { localId: string; serverId: string },
  ): Promise<void>;
  dropAll(): Promise<void>;
}

export interface OutboxReplayInput {
  collectionId: string;
  transport: OutboxTransport;
  store: OutboxStore;
  /** The newest server state known for an item, for its version and current value. */
  known(itemId: string): CollectionItemDetail | undefined;
  onItem(item: CollectionItemDetail): void;
  /**
   * The server created the item for a waiting add. Called before `onItem`
   * puts it into the list, so the owner can stop showing the waiting copy in
   * the same render in which the confirmed item appears.
   */
  onAddConfirmed?(localId: string, created: CollectionItemDetail): void;
  onCollection(collection: CollectionDetail): void;
  now(): number;
}

export interface OutboxReplayResult {
  outcomes: OutboxOutcome[];
  /** `blocked` means something could not be sent yet and is kept for later. */
  status: 'done' | 'blocked';
}

class Blocked extends Error {}
class Dropped extends Error {
  constructor(readonly reason: OutboxDropReason) {
    super(reason);
  }
}

/** Send the waiting changes in order, stopping at the first one that cannot be sent yet. */
export async function replayOutbox(
  input: OutboxReplayInput,
): Promise<OutboxReplayResult> {
  const outcomes: OutboxOutcome[] = [];
  const confirmed = new Map<string, CollectionItemDetail>();
  const named = new Map<string, string>();

  const knownItem = (itemId: string) =>
    confirmed.get(itemId) ?? input.known(itemId);
  const remember = (item: CollectionItemDetail) => {
    confirmed.set(item.id, item);
    input.onItem(item);
  };

  const readCollectionOrBlock = async (): Promise<CollectionDetail> => {
    try {
      const collection = await input.transport.readCollection(
        input.collectionId,
      );
      input.onCollection(collection);
      for (const item of collection.items) confirmed.set(item.id, item);
      return collection;
    } catch (error) {
      const normalized = await normalizeClientError(error);
      if (normalized.kind === 'notFound') throw new Dropped('collectionGone');
      throw new Blocked();
    }
  };

  const send = async (
    op: OutboxSetCompletedOp | OutboxSetQuantityOp,
    itemId: string,
  ) => {
    const wanted = (item: CollectionItemDetail) =>
      op.kind === 'setCompleted'
        ? item.completed === op.completed
        : (item.quantity ?? null) === op.quantity;
    let current = knownItem(itemId);
    if (!current) {
      const collection = await readCollectionOrBlock();
      current = collection.items.find((item) => item.id === itemId);
      if (!current) throw new Dropped('itemGone');
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (wanted(current)) return;
      try {
        const updated = await input.transport.updateItem({
          collectionId: input.collectionId,
          itemId,
          version: current.version,
          ...(op.kind === 'setCompleted'
            ? { completed: op.completed }
            : { quantity: op.quantity }),
        });
        remember(updated);
        return;
      } catch (error) {
        const normalized = await normalizeClientError(error);
        if (normalized.kind === 'notFound') {
          // The list or the item is gone; reading the list tells which.
          await readCollectionOrBlock();
          throw new Dropped('itemGone');
        }
        if (normalized.kind === 'validation') throw new Dropped('rejected');
        // A second conflict in a row means the item keeps changing: keep the
        // change for the next attempt instead of losing it.
        if (normalized.kind !== 'conflict' || attempt === 1)
          throw new Blocked();
        // Someone changed the item in the meantime: take the newest version
        // and set the wanted value on top of it.
        const collection = await readCollectionOrBlock();
        const fresh = collection.items.find((item) => item.id === itemId);
        if (!fresh) throw new Dropped('itemGone');
        current = fresh;
      }
    }
  };

  for (;;) {
    const op = input.store.peek()[0];
    if (!op) return { outcomes, status: 'done' };
    try {
      if (op.kind === 'add') {
        if (input.now() - Date.parse(op.createdAt) > OUTBOX_ADD_MAX_AGE_MS)
          throw new Dropped('expired');
        let created: CollectionItemDetail;
        try {
          created = await input.transport.createItem({
            collectionId: input.collectionId,
            idempotencyKey: op.idempotencyKey,
            title: op.title,
            quantity: op.quantity,
            completed: op.completed,
          });
        } catch (error) {
          const normalized = await normalizeClientError(error);
          if (normalized.kind === 'notFound')
            throw new Dropped('collectionGone');
          if (
            normalized.kind === 'validation' ||
            normalized.kind === 'conflict'
          )
            throw new Dropped('rejected');
          throw new Blocked();
        }
        named.set(op.localId, created.id);
        input.onAddConfirmed?.(op.localId, created);
        remember(created);
        await input.store.settle(op.opId, {
          localId: op.localId,
          serverId: created.id,
        });
      } else {
        const itemId = named.get(op.itemId) ?? op.itemId;
        // A change to an item whose add is gone can never be sent.
        if (isLocalItemId(itemId)) throw new Dropped('orphaned');
        await send(op, itemId);
        await input.store.settle(op.opId);
      }
      outcomes.push({ kind: 'sent', op });
    } catch (error) {
      if (error instanceof Blocked) return { outcomes, status: 'blocked' };
      if (error instanceof Dropped) {
        if (error.reason === 'collectionGone') {
          outcomes.push({ kind: 'dropped', op, reason: error.reason });
          await input.store.dropAll();
          return { outcomes, status: 'done' };
        }
        outcomes.push({ kind: 'dropped', op, reason: error.reason });
        await input.store.settle(op.opId);
        continue;
      }
      throw error;
    }
  }
}
