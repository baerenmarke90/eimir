import { describe, expect, it } from 'vitest';
import {
  clearSharedWishDraft,
  stageSharedWishDraft,
  takeSharedWishDraft,
} from './sharedWishDraft';

describe('sharedWishDraft staging', () => {
  it('hands the draft over exactly once', () => {
    const key = stageSharedWishDraft('scope-a', { title: 'Zelt' });
    expect(takeSharedWishDraft('scope-a', key)).toEqual({ title: 'Zelt' });
    expect(takeSharedWishDraft('scope-a', key)).toBeNull();
  });

  it('does not release a draft to another scope or key', () => {
    const key = stageSharedWishDraft('scope-a', { title: 'Zelt' });
    expect(takeSharedWishDraft('scope-b', key)).toBeNull();
    expect(takeSharedWishDraft('scope-a', 'other-key')).toBeNull();
    expect(takeSharedWishDraft('scope-a', key)).toEqual({ title: 'Zelt' });
  });

  it('replaces an earlier draft', () => {
    const first = stageSharedWishDraft('scope-a', { title: 'Eins' });
    const second = stageSharedWishDraft('scope-a', { title: 'Zwei' });
    expect(takeSharedWishDraft('scope-a', first)).toBeNull();
    expect(takeSharedWishDraft('scope-a', second)).toEqual({ title: 'Zwei' });
  });

  it('clears only a draft owned by the given scope', () => {
    const key = stageSharedWishDraft('scope-a', {
      linkUrl: 'https://a.example/',
    });
    clearSharedWishDraft('scope-b');
    expect(takeSharedWishDraft('scope-a', key)).not.toBeNull();
    const next = stageSharedWishDraft('scope-a', { title: 'x' });
    clearSharedWishDraft('scope-a');
    expect(takeSharedWishDraft('scope-a', next)).toBeNull();
  });
});
