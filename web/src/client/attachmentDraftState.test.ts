import {
  attachmentDraftReducer,
  readyAttachmentIds,
  type AttachmentDraft,
} from './attachmentDraftState';

function draft(id: string): AttachmentDraft {
  return {
    id,
    file: new File(['image'], `${id}.jpg`, { type: 'image/jpeg' }),
    previewUrl: `blob:${id}`,
    status: 'uploading',
    attempt: 0,
    progress: 0,
  };
}

describe('attachmentDraftReducer', () => {
  it('keeps the local preview available immediately while upload is pending', () => {
    const state = attachmentDraftReducer([], {
      type: 'add',
      draft: draft('one'),
    });

    expect(state[0]).toMatchObject({
      previewUrl: 'blob:one',
      status: 'uploading',
      attempt: 0,
      progress: 0,
    });
  });

  it('tracks upload progress only for the active attempt', () => {
    let state = attachmentDraftReducer([], {
      type: 'add',
      draft: draft('one'),
    });
    state = attachmentDraftReducer(state, {
      type: 'start',
      id: 'one',
      attempt: 1,
    });
    state = attachmentDraftReducer(state, {
      type: 'progress',
      id: 'one',
      attempt: 1,
      progress: 37,
    });
    expect(state[0]?.progress).toBe(37);

    state = attachmentDraftReducer(state, {
      type: 'start',
      id: 'one',
      attempt: 2,
    });
    state = attachmentDraftReducer(state, {
      type: 'progress',
      id: 'one',
      attempt: 1,
      progress: 99,
    });
    expect(state[0]).toMatchObject({ attempt: 2, progress: 0 });

    state = attachmentDraftReducer(state, {
      type: 'phase',
      id: 'one',
      attempt: 2,
      status: 'validating',
    });
    expect(state[0]).toMatchObject({ status: 'validating', progress: 100 });
  });

  it('ignores a late READY result after the draft was removed', () => {
    let state = attachmentDraftReducer([], {
      type: 'add',
      draft: draft('one'),
    });
    state = attachmentDraftReducer(state, {
      type: 'start',
      id: 'one',
      attempt: 1,
    });
    state = attachmentDraftReducer(state, { type: 'remove', id: 'one' });
    state = attachmentDraftReducer(state, {
      type: 'ready',
      id: 'one',
      attempt: 1,
      attachmentId: 'attachment-old',
    });

    expect(state).toEqual([]);
  });

  it('retries a failed draft and ignores stale results from the previous attempt', () => {
    let state = attachmentDraftReducer([], {
      type: 'add',
      draft: draft('one'),
    });
    state = attachmentDraftReducer(state, {
      type: 'start',
      id: 'one',
      attempt: 1,
    });
    state = attachmentDraftReducer(state, {
      type: 'failed',
      id: 'one',
      attempt: 1,
      error: 'validation failed',
    });
    expect(state[0]).toMatchObject({
      status: 'failed',
      attempt: 1,
      error: 'validation failed',
    });

    state = attachmentDraftReducer(state, {
      type: 'start',
      id: 'one',
      attempt: 2,
    });
    expect(state[0]).toMatchObject({
      status: 'uploading',
      attempt: 2,
      error: undefined,
    });

    state = attachmentDraftReducer(state, {
      type: 'ready',
      id: 'one',
      attempt: 1,
      attachmentId: 'attachment-stale',
    });
    expect(state[0]).toMatchObject({ status: 'uploading', attempt: 2 });

    state = attachmentDraftReducer(state, {
      type: 'ready',
      id: 'one',
      attempt: 2,
      attachmentId: 'attachment-current',
    });
    expect(state[0]).toMatchObject({
      status: 'ready',
      attempt: 2,
      progress: 100,
      attachmentId: 'attachment-current',
    });
  });

  it('returns only READY attachments in stable user-visible order', () => {
    let state = [draft('one'), draft('two'), draft('three')];
    state = attachmentDraftReducer(state, {
      type: 'start',
      id: 'one',
      attempt: 1,
    });
    state = attachmentDraftReducer(state, {
      type: 'ready',
      id: 'one',
      attempt: 1,
      attachmentId: 'attachment-1',
    });
    state = attachmentDraftReducer(state, {
      type: 'start',
      id: 'two',
      attempt: 2,
    });
    state = attachmentDraftReducer(state, {
      type: 'failed',
      id: 'two',
      attempt: 2,
      error: 'failed',
    });
    state = attachmentDraftReducer(state, {
      type: 'start',
      id: 'three',
      attempt: 3,
    });
    state = attachmentDraftReducer(state, {
      type: 'ready',
      id: 'three',
      attempt: 3,
      attachmentId: 'attachment-3',
    });

    expect(readyAttachmentIds(state)).toEqual(['attachment-1', 'attachment-3']);
  });
});
