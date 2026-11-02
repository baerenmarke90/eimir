import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { AttachmentEntry } from '../api/generated/models/AttachmentEntry';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import type { AttachmentDraft } from './attachmentDraftState';
import { MAX_MEMORY_ATTACHMENTS } from './attachmentLimits';
import {
  useAttachmentDrafts,
  type AttachmentDraftOptions,
} from './useAttachmentDrafts';

export interface OrderedPhotoDraftItem {
  key: string;
  existing?: OrderedAttachmentSummary;
  draft?: AttachmentDraft;
  isSensitive: boolean;
}

/** Retain the chosen order while newly selected identities append once. */
export function orderedPhotoKeys(
  available: readonly string[],
  preferred: readonly string[],
): string[] {
  return [
    ...preferred.filter((key) => available.includes(key)),
    ...available.filter((key) => !preferred.includes(key)),
  ];
}

export function movePhotoKey(
  keys: readonly string[],
  key: string,
  offset: -1 | 1,
): string[] {
  const index = keys.indexOf(key);
  const target = index + offset;
  const order = [...keys];
  if (index >= 0 && target >= 0 && target < order.length)
    [order[index], order[target]] = [order[target], order[index]];
  return order;
}

export function useOrderedPhotoDrafts(options: AttachmentDraftOptions) {
  const scope = JSON.stringify([
    options.apiBaseUrl,
    options.accountId,
    options.spaceId,
    options.resourceKey,
  ]);
  const [state, setState] = useState<{
    scope: string;
    existing: OrderedAttachmentSummary[];
    order: string[];
  }>({ scope, existing: [], order: [] });
  const existing = state.scope === scope ? state.existing : [];
  const uploads = useAttachmentDrafts({
    ...options,
    maxAttachments: MAX_MEMORY_ATTACHMENTS - existing.length,
  });
  const clearUploads = uploads.clear;
  const lastScope = useRef(scope);
  useLayoutEffect(() => {
    if (lastScope.current === scope) return;
    lastScope.current = scope;
    clearUploads();
    setState({ scope, existing: [], order: [] });
  }, [scope, clearUploads]);
  const available: OrderedPhotoDraftItem[] = [
    ...existing.map((photo) => ({
      key: `saved:${photo.id}`,
      existing: photo,
      isSensitive: photo.isSensitive === true,
    })),
    ...(state.scope === scope ? uploads.items : []).map((draft) => ({
      key: `draft:${draft.id}`,
      draft,
      isSensitive: draft.isSensitive === true,
    })),
  ];
  const byKey = new Map(available.map((item) => [item.key, item]));
  const preferred = state.scope === scope ? state.order : [];
  const keys = orderedPhotoKeys(
    available.map((item) => item.key),
    preferred,
  );
  const items = keys.flatMap((key) => {
    const item = byKey.get(key);
    return item ? [item] : [];
  });
  const entries: AttachmentEntry[] = items.flatMap((item, position) => {
    const id =
      item.existing?.id ??
      (item.draft?.status === 'ready' ? item.draft.attachmentId : undefined);
    return id
      ? [{ attachmentId: id, position, isSensitive: item.isSensitive }]
      : [];
  });
  const load = useCallback(
    (photos: OrderedAttachmentSummary[]) => {
      clearUploads();
      setState({
        scope,
        existing: photos,
        order: photos.map((photo) => `saved:${photo.id}`),
      });
    },
    [scope, clearUploads],
  );
  const clear = useCallback(() => load([]), [load]);
  function remove(item: OrderedPhotoDraftItem) {
    if (item.draft) uploads.remove(item.draft.id);
    setState({
      scope,
      existing: existing.filter((photo) => photo.id !== item.existing?.id),
      order: keys.filter((key) => key !== item.key),
    });
  }
  function move(key: string, offset: -1 | 1) {
    const index = keys.indexOf(key);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= keys.length) return;
    const order = movePhotoKey(keys, key, offset);
    setState({ scope, existing, order });
  }
  function setSensitive(item: OrderedPhotoDraftItem, value: boolean) {
    if (item.draft) uploads.setSensitive(item.draft.id, value);
    if (item.existing)
      setState({
        scope,
        order: keys,
        existing: existing.map((photo) =>
          photo.id === item.existing?.id
            ? { ...photo, isSensitive: value }
            : photo,
        ),
      });
  }
  return {
    items,
    entries,
    uploads,
    load,
    remove,
    move,
    setSensitive,
    clear,
    hasPending: uploads.hasPending,
    hasFailed: uploads.items.some((item) => item.status === 'failed'),
    apis: options.apis,
  };
}

export type OrderedPhotoDraftController = ReturnType<
  typeof useOrderedPhotoDrafts
>;
