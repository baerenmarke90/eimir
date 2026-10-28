import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  type AttachmentDraft,
  type AttachmentDraftAction,
  attachmentDraftReducer,
  hasPendingAttachments,
  readyAttachmentIds,
} from './attachmentDraftState';
import {
  type DraftUploadPhase,
  uploadMemoryDraftAttachment,
} from './memoryAttachmentDraft';
import { createOwnedObjectUrl, type OwnedObjectUrl } from './objectUrlResource';
import type { ReferenceApis } from './referenceFlow';
import { recoverSelectedPhoto } from './recoverSelectedPhoto';
import { selectedPhotoUnavailable } from './selectedMediaRetention';
import { i18n } from '../i18n';

/**
 * How many automatic draft uploads run at once (#701). A small, fixed queue
 * width, not a security boundary -- the backend's 20-attachment/500MiB
 * limits remain authoritative regardless of this value. Bounding it also
 * bounds READY-status polling, since polling only ever runs for the
 * currently in-flight uploads.
 */
const MAX_CONCURRENT_UPLOADS = 3;

export interface AttachmentDraftOptions {
  apis: ReferenceApis;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
  fetchApi?: typeof fetch;
  uploadAttachmentFn?: typeof uploadMemoryDraftAttachment;
  /**
   * Caller-computed remaining capacity (`MAX_MEMORY_ATTACHMENTS -
   * alreadyBoundAttachmentCount`). Files beyond this never start a server
   * upload. Defaults to unlimited for callers that enforce their own cap
   * natively (e.g. a single-file picker).
   */
  maxAttachments?: number;
}

/** Volatile handoff for one asynchronous picker result, never provider state. */
export interface AttachmentDraftSelection {
  readonly signal: AbortSignal;
  /** True means delivered to the existing capacity/upload flow, not saved. */
  commit: (files: readonly File[]) => boolean;
  cancel: () => void;
}

export function formatAttachmentDraftContextKey(
  accountId: string,
  spaceId: string,
): string {
  return `${accountId}:${spaceId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

interface AttachmentDraftStore {
  contextKey: string;
  generation: number;
  items: AttachmentDraft[];
}

type AttachmentDraftStoreAction =
  | { type: 'reset_context'; contextKey: string; generation: number }
  | {
      type: 'draft_action';
      contextKey: string;
      generation: number;
      action: AttachmentDraftAction;
    };

function attachmentDraftStoreReducer(
  state: AttachmentDraftStore,
  action: AttachmentDraftStoreAction,
): AttachmentDraftStore {
  if (action.type === 'reset_context') {
    return {
      contextKey: action.contextKey,
      generation: action.generation,
      items: [],
    };
  }
  if (
    action.contextKey !== state.contextKey ||
    action.generation !== state.generation
  ) {
    return state;
  }
  return {
    ...state,
    items: attachmentDraftReducer(state.items, action.action),
  };
}

function abortAndRevoke(
  uploads: Map<string, AbortController>,
  previewUrls: Map<string, OwnedObjectUrl>,
): void {
  for (const controller of uploads.values()) {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }
  uploads.clear();
  for (const previewResource of previewUrls.values()) {
    previewResource.dispose();
  }
  previewUrls.clear();
}

function abortSelections(selections: Set<AbortController>): void {
  const pending = [...selections];
  selections.clear();
  for (const controller of pending) controller.abort();
}

export function useAttachmentDrafts({
  apis,
  apiBaseUrl,
  accessToken,
  spaceId,
  accountId,
  fetchApi = fetch,
  uploadAttachmentFn = uploadMemoryDraftAttachment,
  maxAttachments = Number.POSITIVE_INFINITY,
}: AttachmentDraftOptions) {
  const contextKey = formatAttachmentDraftContextKey(accountId, spaceId);
  const committedContextKey = useRef(contextKey);
  const currentGeneration = useRef(1);
  const nextAttempt = useRef(0);
  const previewUrls = useRef(new Map<string, OwnedObjectUrl>());
  const uploads = useRef(new Map<string, AbortController>());
  const selections = useRef(new Set<AbortController>());
  const selectionEndpoint = useRef(apiBaseUrl);
  const mounted = useRef(true);
  // Bounded automatic-upload orchestration (#701): draftCount tracks
  // reserved capacity synchronously (state/`items` only updates on the next
  // render), queue holds drafts accepted but not yet started, and
  // activeUploads counts uploads currently running so pump() never starts
  // more than MAX_CONCURRENT_UPLOADS at once.
  const draftCount = useRef(0);
  const queue = useRef<Array<{ id: string; file: File }>>([]);
  const activeUploads = useRef(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  const [store, dispatch] = useReducer(attachmentDraftStoreReducer, {
    contextKey,
    generation: currentGeneration.current,
    items: [],
  });

  useLayoutEffect(() => {
    if (committedContextKey.current !== contextKey) {
      committedContextKey.current = contextKey;
      currentGeneration.current += 1;
      abortSelections(selections.current);
      abortAndRevoke(uploads.current, previewUrls.current);
      draftCount.current = 0;
      queue.current = [];
      activeUploads.current = 0;
      setRejectedCount(0);
      dispatch({
        type: 'reset_context',
        contextKey,
        generation: currentGeneration.current,
      });
    }
  }, [contextKey]);

  useLayoutEffect(() => {
    if (selectionEndpoint.current !== apiBaseUrl) {
      selectionEndpoint.current = apiBaseUrl;
      abortSelections(selections.current);
    }
  }, [apiBaseUrl]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortSelections(selections.current);
      abortAndRevoke(uploads.current, previewUrls.current);
    };
  }, []);

  const isCurrentContext =
    store.contextKey === contextKey &&
    store.generation === currentGeneration.current &&
    committedContextKey.current === contextKey;
  const items = isCurrentContext ? store.items : [];

  // `pump` and `runUpload` are mutually recursive (pump starts queued
  // uploads; each upload's completion calls pump again to start the next
  // one). runUploadRef breaks the circular useCallback dependency.
  const runUploadRef = useRef<(id: string, file: File) => void>(() => {});

  const pump = useCallback(() => {
    while (
      activeUploads.current < MAX_CONCURRENT_UPLOADS &&
      queue.current.length > 0
    ) {
      const next = queue.current.shift();
      if (!next) break;
      activeUploads.current += 1;
      runUploadRef.current(next.id, next.file);
    }
  }, []);

  const runUpload = useCallback(
    (id: string, file: File) => {
      uploads.current.get(id)?.abort();
      const controller = new AbortController();
      uploads.current.set(id, controller);
      const attempt = ++nextAttempt.current;
      const uploadGeneration = currentGeneration.current;
      const uploadContextKey = committedContextKey.current;

      dispatch({
        type: 'draft_action',
        contextKey: uploadContextKey,
        generation: uploadGeneration,
        action: { type: 'start', id, attempt },
      });

      const isCurrentAttempt = () =>
        mounted.current &&
        uploadGeneration === currentGeneration.current &&
        uploadContextKey === committedContextKey.current &&
        !controller.signal.aborted;

      const updatePhase = (status: DraftUploadPhase) => {
        if (!isCurrentAttempt()) return;
        dispatch({
          type: 'draft_action',
          contextKey: uploadContextKey,
          generation: uploadGeneration,
          action: { type: 'phase', id, attempt, status },
        });
      };
      const updateProgress = (progress: number) => {
        if (!isCurrentAttempt()) return;
        dispatch({
          type: 'draft_action',
          contextKey: uploadContextKey,
          generation: uploadGeneration,
          action: { type: 'progress', id, attempt, progress },
        });
      };

      void uploadAttachmentFn(
        apis,
        apiBaseUrl,
        accessToken,
        spaceId,
        file,
        updatePhase,
        fetchApi,
        {
          signal: controller.signal,
          onProgress: updateProgress,
          preserveMetadata: true,
        },
      )
        .then(({ attachmentId }) => {
          uploads.current.delete(id);
          if (!isCurrentAttempt()) return;
          dispatch({
            type: 'draft_action',
            contextKey: uploadContextKey,
            generation: uploadGeneration,
            action: { type: 'ready', id, attempt, attachmentId },
          });
        })
        .catch((error: unknown) => {
          uploads.current.delete(id);
          if (!isCurrentAttempt()) return;
          dispatch({
            type: 'draft_action',
            contextKey: uploadContextKey,
            generation: uploadGeneration,
            action: {
              type: 'failed',
              id,
              attempt,
              error: errorMessage(error),
            },
          });
        })
        .finally(() => {
          // A reset already released the previous generation's slots. A late
          // completion must never release a slot from the new draft's queue.
          if (
            !mounted.current ||
            uploadGeneration !== currentGeneration.current ||
            uploadContextKey !== committedContextKey.current
          )
            return;
          activeUploads.current = Math.max(0, activeUploads.current - 1);
          pump();
        });
    },
    [
      accessToken,
      apiBaseUrl,
      apis,
      fetchApi,
      pump,
      spaceId,
      uploadAttachmentFn,
    ],
  );
  useLayoutEffect(() => {
    runUploadRef.current = runUpload;
  }, [runUpload]);

  const enqueue = useCallback(
    (id: string, file: File) => {
      queue.current.push({ id, file });
      pump();
    },
    [pump],
  );

  const restore = useCallback(
    (
      selected: readonly {
        file: File;
        attachmentId?: string;
        isSensitive?: boolean;
      }[],
    ) => {
      const currentContext = committedContextKey.current;
      const currentGen = currentGeneration.current;
      const remainingCapacity = Math.max(
        0,
        maxAttachments - draftCount.current,
      );
      const accepted = selected.slice(0, remainingCapacity);
      setRejectedCount(selected.length - accepted.length);

      for (const { file, attachmentId, isSensitive } of accepted) {
        const id = globalThis.crypto.randomUUID();
        const unavailable = selectedPhotoUnavailable(file);
        const previewResource = unavailable
          ? undefined
          : createOwnedObjectUrl(file);
        const previewUrl = previewResource?.url ?? '';
        if (previewResource) previewUrls.current.set(id, previewResource);
        draftCount.current += 1;
        dispatch({
          type: 'draft_action',
          contextKey: currentContext,
          generation: currentGen,
          action: {
            type: 'add',
            draft: {
              id,
              file,
              previewUrl,
              status: unavailable
                ? 'failed'
                : attachmentId
                  ? 'ready'
                  : 'uploading',
              attempt: 0,
              progress: attachmentId ? 100 : 0,
              attachmentId,
              isSensitive: isSensitive ?? false,
              error: unavailable
                ? i18n.t('memory.diary.photoUnavailable')
                : undefined,
            },
          },
        });
        if (!attachmentId && !unavailable) enqueue(id, file);
      }
    },
    [enqueue, maxAttachments],
  );

  const addFiles = useCallback(
    (files: FileList | readonly File[] | null) => {
      if (files) restore(Array.from(files, (file) => ({ file })));
    },
    [restore],
  );

  // A picker can finish after capacity or transport props changed. Use the
  // latest committed ingress only after validating its launch ownership.
  const addSelectedFiles = useRef(addFiles);
  useLayoutEffect(() => {
    addSelectedFiles.current = addFiles;
  }, [addFiles]);

  const beginSelection = useCallback((): AttachmentDraftSelection => {
    const selectionContext = committedContextKey.current;
    const selectionGeneration = currentGeneration.current;
    const endpoint = selectionEndpoint.current;
    const controller = new AbortController();
    let settled = false;
    const cancelSelection = () => {
      settled = true;
      selections.current.delete(controller);
      controller.abort();
    };
    if (mounted.current) selections.current.add(controller);
    else cancelSelection();

    return {
      signal: controller.signal,
      cancel: cancelSelection,
      commit(files) {
        if (
          settled ||
          controller.signal.aborted ||
          !mounted.current ||
          selectionContext !== committedContextKey.current ||
          endpoint !== selectionEndpoint.current ||
          selectionGeneration !== currentGeneration.current
        ) {
          cancelSelection();
          return false;
        }
        settled = true;
        selections.current.delete(controller);
        addSelectedFiles.current(files);
        return true;
      },
    };
  }, []);

  const cancel = useCallback((id: string) => {
    uploads.current.get(id)?.abort();
    uploads.current.delete(id);
    queue.current = queue.current.filter((item) => item.id !== id);
  }, []);

  const remove = useCallback(
    (id: string) => {
      cancel(id);
      draftCount.current = Math.max(0, draftCount.current - 1);
      previewUrls.current.get(id)?.dispose();
      previewUrls.current.delete(id);
      dispatch({
        type: 'draft_action',
        contextKey: committedContextKey.current,
        generation: currentGeneration.current,
        action: { type: 'remove', id },
      });
    },
    [cancel],
  );

  const retry = useCallback(
    (draft: AttachmentDraft) => {
      if (!selectedPhotoUnavailable(draft.file)) {
        enqueue(draft.id, draft.file);
        return;
      }
      uploads.current.get(draft.id)?.abort();
      const controller = new AbortController();
      uploads.current.set(draft.id, controller);
      const context = committedContextKey.current;
      const generation = currentGeneration.current;
      const endpoint = selectionEndpoint.current;
      const current = () =>
        mounted.current &&
        !controller.signal.aborted &&
        context === committedContextKey.current &&
        endpoint === selectionEndpoint.current &&
        generation === currentGeneration.current;
      void recoverSelectedPhoto(
        apis,
        spaceId,
        draft.file,
        draft.attachmentId,
        controller.signal,
      )
        .then((file) => {
          if (!current()) return;
          const preview = createOwnedObjectUrl(file);
          previewUrls.current.get(draft.id)?.dispose();
          previewUrls.current.set(draft.id, preview);
          dispatch({
            type: 'draft_action',
            contextKey: context,
            generation,
            action: {
              type: 'recovered',
              id: draft.id,
              file,
              previewUrl: preview.url,
            },
          });
        })
        .catch(() => {
          if (current())
            dispatch({
              type: 'draft_action',
              contextKey: context,
              generation,
              action: {
                type: 'failed',
                id: draft.id,
                attempt: draft.attempt,
                keepAttachmentId: true,
                error: i18n.t('memory.diary.photoUnavailable'),
              },
            });
        })
        .finally(() => {
          if (uploads.current.get(draft.id) === controller)
            uploads.current.delete(draft.id);
        });
    },
    [apis, spaceId, enqueue],
  );

  const clear = useCallback(() => {
    currentGeneration.current += 1;
    abortSelections(selections.current);
    abortAndRevoke(uploads.current, previewUrls.current);
    draftCount.current = 0;
    queue.current = [];
    activeUploads.current = 0;
    setRejectedCount(0);
    dispatch({
      type: 'reset_context',
      contextKey: committedContextKey.current,
      generation: currentGeneration.current,
    });
  }, []);

  const readyIds = useMemo(() => readyAttachmentIds(items), [items]);
  const replaceReadyId = useCallback(
    (draft: AttachmentDraft, attachmentId: string) => {
      dispatch({
        type: 'draft_action',
        contextKey: committedContextKey.current,
        generation: currentGeneration.current,
        action: {
          type: 'ready',
          id: draft.id,
          attempt: draft.attempt,
          attachmentId,
        },
      });
    },
    [],
  );
  const move = useCallback((id: string, offset: -1 | 1) => {
    dispatch({
      type: 'draft_action',
      contextKey: committedContextKey.current,
      generation: currentGeneration.current,
      action: { type: 'move', id, offset },
    });
  }, []);
  const hasPending = useMemo(() => hasPendingAttachments(items), [items]);

  return {
    items,
    addFiles,
    beginSelection,
    restore,
    replaceReadyId,
    move,
    cancel,
    remove,
    retry,
    clear,
    readyIds,
    setSensitive: (id: string, value: boolean) =>
      dispatch({
        type: 'draft_action',
        contextKey: committedContextKey.current,
        generation: currentGeneration.current,
        action: { type: 'sensitive', id, value },
      }),
    hasPending,
    rejectedCount,
    contextKey,
    generation: currentGeneration.current,
  };
}
