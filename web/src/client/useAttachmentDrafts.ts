import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  attachmentDraftReducer,
  hasPendingAttachments,
  readyAttachmentIds,
  type AttachmentDraft,
  type AttachmentDraftAction,
} from './attachmentDraftState';
import {
  uploadMemoryDraftAttachment,
  type DraftUploadPhase,
} from './memoryAttachmentDraft';
import {
  createOwnedObjectUrl,
  type OwnedObjectUrl,
} from './objectUrlResource';
import type { ReferenceApis } from './referenceFlow';

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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
        { signal: controller.signal, onProgress: updateProgress },
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
          // Release the queue slot even for a removed/aborted/stale-context
          // draft: the slot belongs to the upload lifecycle, not to whether
          // its result was still relevant.
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
  runUploadRef.current = runUpload;

  const enqueue = useCallback(
    (id: string, file: File) => {
      queue.current.push({ id, file });
      pump();
    },
    [pump],
  );

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const currentContext = committedContextKey.current;
      const currentGen = currentGeneration.current;
      const selected = Array.from(files);
      const remainingCapacity = Math.max(
        0,
        maxAttachments - draftCount.current,
      );
      const accepted = selected.slice(0, remainingCapacity);
      setRejectedCount(selected.length - accepted.length);

      for (const file of accepted) {
        const id = globalThis.crypto.randomUUID();
        const previewResource = createOwnedObjectUrl(file);
        const previewUrl = previewResource.url;
        previewUrls.current.set(id, previewResource);
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
              status: 'uploading',
              attempt: 0,
              progress: 0,
            },
          },
        });
        enqueue(id, file);
      }
    },
    [enqueue, maxAttachments],
  );

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
    (draft: AttachmentDraft) => enqueue(draft.id, draft.file),
    [enqueue],
  );

  const clear = useCallback(() => {
    currentGeneration.current += 1;
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
  const hasPending = useMemo(() => hasPendingAttachments(items), [items]);

  return {
    items,
    addFiles,
    cancel,
    remove,
    retry,
    clear,
    readyIds,
    hasPending,
    rejectedCount,
    contextKey,
    generation: currentGeneration.current,
  };
}
