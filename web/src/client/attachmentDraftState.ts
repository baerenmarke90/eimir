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
  | { type: 'failed'; id: string; attempt: number; error: string }
  | { type: 'remove'; id: string }
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
          attachmentId: undefined,
          error: action.error,
        }),
      );
    case 'remove':
      return drafts.filter((draft) => draft.id !== action.id);
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
