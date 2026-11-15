import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { AttachmentEntry } from '../api/generated/models/AttachmentEntry';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import type { AttachmentDraft } from './attachmentDraftState';
import { MAX_MEMORY_ATTACHMENTS } from './attachmentLimits';
import {
  type AttachmentDraftOptions,
  useAttachmentDrafts,
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
    coverKey: string | null;
  }>({ scope, existing: [], order: [], coverKey: null });
  const existing = state.scope === scope ? state.existing : [];
  const coverKey = state.scope === scope ? state.coverKey : null;
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
    setState({ scope, existing: [], order: [], coverKey: null });
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
    (photos: OrderedAttachmentSummary[], selectedCoverId?: string | null) => {
      clearUploads();
      setState({
        scope,
        existing: photos,
        coverKey: selectedCoverId ? `saved:${selectedCoverId}` : null,
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
      coverKey: coverKey === item.key ? null : coverKey,
      existing: existing.filter((photo) => photo.id !== item.existing?.id),
      order: keys.filter((key) => key !== item.key),
    });
  }
  function move(key: string, offset: -1 | 1) {
    const index = keys.indexOf(key);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= keys.length) return;
    const order = movePhotoKey(keys, key, offset);
    setState({ scope, existing, order, coverKey });
  }
  function setSensitive(item: OrderedPhotoDraftItem, value: boolean) {
    if (item.draft) uploads.setSensitive(item.draft.id, value);
    if (item.existing)
      setState({
        scope,
        order: keys,
        coverKey,
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
    selectedCoverKey: items.some((item) => item.key === coverKey)
      ? coverKey
      : null,
    selectedCoverAttachmentId:
      items.find((item) => item.key === coverKey)?.existing?.id ??
      items.find((item) => item.key === coverKey)?.draft?.attachmentId ??
      null,
    selectCover: (key: string | null) =>
      setState({ scope, existing, order: keys, coverKey: key }),
    reorder: (order: string[]) =>
      setState({
        scope,
        existing,
        order: orderedPhotoKeys(keys, order),
        coverKey,
      }),
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
