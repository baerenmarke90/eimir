export type AttachmentDraftStatus =
  | 'uploading'
  | 'validating'
  | 'ready'
  | 'failed';

export interface AttachmentDraft {
  id: string;
  file: File;
  previewUrl: string;
  status: AttachmentDraftStatus;
  attempt: number;
  progress: number;
  attachmentId?: string;
  isSensitive?: boolean;
  error?: string;
}

export type AttachmentDraftAction =
  | { type: 'add'; draft: AttachmentDraft }
  | { type: 'start'; id: string; attempt: number }
  | { type: 'progress'; id: string; attempt: number; progress: number }
  | {
      type: 'phase';
      id: string;
      attempt: number;
      status: 'uploading' | 'validating';
    }
  | { type: 'ready'; id: string; attempt: number; attachmentId: string }
  | {
      type: 'failed';
      id: string;
      attempt: number;
      error: string;
      keepAttachmentId?: boolean;
    }
  | { type: 'recovered'; id: string; file: File; previewUrl: string }
  | { type: 'sensitive'; id: string; value: boolean }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; offset: -1 | 1 }
  | { type: 'clear' };

function updateCurrentAttempt(
  drafts: AttachmentDraft[],
  id: string,
  attempt: number,
  update: (draft: AttachmentDraft) => AttachmentDraft,
): AttachmentDraft[] {
  return drafts.map((draft) =>
    draft.id === id && draft.attempt === attempt ? update(draft) : draft,
  );
}

export function attachmentDraftReducer(
  drafts: AttachmentDraft[],
  action: AttachmentDraftAction,
): AttachmentDraft[] {
  switch (action.type) {
    case 'add':
      return [...drafts, action.draft];
    case 'start':
      return drafts.map((draft) =>
        draft.id === action.id
          ? {
              ...draft,
              status: 'uploading',
              attempt: action.attempt,
              progress: 0,
              attachmentId: undefined,
              error: undefined,
            }
          : draft,
      );
    case 'progress':
      return updateCurrentAttempt(
        drafts,
        action.id,
        action.attempt,
        (draft) => ({
          ...draft,
          progress: Math.max(0, Math.min(100, action.progress)),
        }),
      );
    case 'phase':
      return updateCurrentAttempt(
        drafts,
        action.id,
        action.attempt,
        (draft) => ({
          ...draft,
          status: action.status,
          progress: action.status === 'validating' ? 100 : draft.progress,
          error: undefined,
        }),
      );
    case 'ready':
      return updateCurrentAttempt(
        drafts,
        action.id,
        action.attempt,
        (draft) => ({
          ...draft,
          status: 'ready',
          progress: 100,
          attachmentId: action.attachmentId,
          error: undefined,
        }),
      );
    case 'failed':
      return updateCurrentAttempt(
        drafts,
        action.id,
        action.attempt,
        (draft) => ({
          ...draft,
          status: 'failed',
          attachmentId: action.keepAttachmentId
            ? draft.attachmentId
            : undefined,
          error: action.error,
        }),
      );
    case 'recovered':
      return drafts.map((draft) =>
        draft.id === action.id
          ? {
              ...draft,
              file: action.file,
              previewUrl: action.previewUrl,
              status: 'ready',
              progress: 100,
              error: undefined,
            }
          : draft,
      );
    case 'sensitive':
      return drafts.map((draft) =>
        draft.id === action.id
          ? { ...draft, isSensitive: action.value }
          : draft,
      );
    case 'remove':
      return drafts.filter((draft) => draft.id !== action.id);
    case 'move': {
      const from = drafts.findIndex((draft) => draft.id === action.id);
      const to = from + action.offset;
      if (from < 0 || to < 0 || to >= drafts.length) return drafts;
      const result = [...drafts];
      [result[from], result[to]] = [result[to], result[from]];
      return result;
    }
    case 'clear':
      return [];
  }
}

export function readyAttachmentIds(drafts: AttachmentDraft[]): string[] {
  return drafts.flatMap((draft) =>
    draft.status === 'ready' && draft.attachmentId ? [draft.attachmentId] : [],
  );
}

export function hasPendingAttachments(drafts: AttachmentDraft[]): boolean {
  return drafts.some(
    (draft) => draft.status === 'uploading' || draft.status === 'validating',
  );
}
