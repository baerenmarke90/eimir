import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';

/** Test data only: invented names and words, never real content. */
export function sharedNote(
  overrides: Partial<SharedNoteDetail> & { id: string },
): SharedNoteDetail {
  return {
    spaceId: 'space-1',
    createdBy: 'account-1',
    title: 'Holiday flat',
    body: 'Key box left of the door\n• bins on Monday\n• quiet hours at ten',
    pinned: false,
    wirTitleOnly: false,
    version: 1,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    editedAt: new Date('2026-11-12T18:42:00Z'),
    editedBy: 'account-2',
    creator: { id: 'account-1', displayName: 'Alex Example' },
    editor: { id: 'account-2', displayName: 'Jonas Example' },
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    ...overrides,
  } as SharedNoteDetail;
}
