import { afterEach, describe, expect, it } from 'vitest';
import { clearSharedWishDraft, stageSharedWishDraft } from './sharedWishDraft';
import {
  isWishMediaDirty,
  mergeSharedWishDraft,
  normalizeWishLink,
  releaseTakenSharedWishDraft,
  resolveWishPhoto,
  safeWishLink,
  sharedWishConflicts,
  takeSharedWishDraftOnce,
  WISH_LINK_MAX_LENGTH,
  wishCreateMedia,
  wishLinkHost,
  wishMediaPatch,
} from './wishLinkPhoto';

const NONE = { attachmentId: null, settled: true } as const;
const READY = { attachmentId: 'photo-2', settled: true } as const;
const UNSETTLED = { attachmentId: null, settled: false } as const;

describe('normalizeWishLink', () => {
  it('treats blank input as empty', () => {
    expect(normalizeWishLink('')).toEqual({ kind: 'empty' });
    expect(normalizeWishLink('   \n ')).toEqual({ kind: 'empty' });
  });

  it('trims and keeps a complete http or https link', () => {
    expect(normalizeWishLink('  https://hut.example/tour?x=1#top ')).toEqual({
      kind: 'valid',
      url: 'https://hut.example/tour?x=1#top',
    });
    expect(normalizeWishLink('http://hut.example')).toEqual({
      kind: 'valid',
      url: 'http://hut.example',
    });
  });

  it('adds https when the scheme is missing', () => {
    expect(normalizeWishLink('www.hut.example/rooms')).toEqual({
      kind: 'valid',
      url: 'https://www.hut.example/rooms',
    });
    expect(normalizeWishLink('hut.example:8443/rooms')).toEqual({
      kind: 'valid',
      url: 'https://hut.example:8443/rooms',
    });
    expect(normalizeWishLink('//hut.example')).toEqual({
      kind: 'valid',
      url: 'https://hut.example',
    });
  });

  it('lowercases the scheme only', () => {
    expect(normalizeWishLink('HTTPS://Hut.example/Rooms')).toEqual({
      kind: 'valid',
      url: 'https://Hut.example/Rooms',
    });
  });

  it('rejects every scheme except http and https', () => {
    for (const input of [
      'javascript:alert(1)',
      'mailto:a@b.example',
      'data:text/html,hi',
      'ftp://hut.example',
      'file:///etc/passwd',
      'tel:+4912345',
    ])
      expect(normalizeWishLink(input), input).toEqual({
        kind: 'invalid',
        reason: 'scheme',
      });
  });

  it('rejects text that is not an address', () => {
    for (const input of [
      'a hut in the mountains',
      'hut',
      'https://',
      'https://user:pass@hut.example',
      'https://hut.',
    ])
      expect(normalizeWishLink(input), input).toMatchObject({
        kind: 'invalid',
        reason: 'format',
      });
  });

  it('accepts exactly the length limit and rejects one more character', () => {
    const prefix = 'https://hut.example/';
    const atLimit = prefix + 'a'.repeat(WISH_LINK_MAX_LENGTH - prefix.length);
    expect(normalizeWishLink(atLimit)).toEqual({ kind: 'valid', url: atLimit });
    expect(normalizeWishLink(`${atLimit}a`)).toEqual({
      kind: 'invalid',
      reason: 'length',
    });
  });

  it('presents a host without www and drops unsafe stored links', () => {
    expect(wishLinkHost('https://www.hut.example/rooms')).toBe('hut.example');
    expect(safeWishLink('https://hut.example/')).toBe('https://hut.example/');
    expect(safeWishLink('javascript:alert(1)')).toBeNull();
    expect(safeWishLink(null)).toBeNull();
    expect(safeWishLink('')).toBeNull();
  });
});

describe('resolveWishPhoto and dirty detection', () => {
  it('has no photo and is settled when there is no draft item', () => {
    expect(resolveWishPhoto(0, [])).toEqual(NONE);
  });

  it('settles on the ready attachment', () => {
    expect(resolveWishPhoto(1, ['photo-2'])).toEqual(READY);
  });

  it('is unsettled while the photo prepares, uploads, validates or failed', () => {
    expect(resolveWishPhoto(1, [])).toEqual(UNSETTLED);
  });

  it('is clean when nothing changed', () => {
    const baseline = { linkUrl: 'https://a.example/', photoAttachmentId: 'p1' };
    expect(
      isWishMediaDirty(baseline, 'https://a.example/', {
        attachmentId: 'p1',
        settled: true,
      }),
    ).toBe(false);
  });

  it('is dirty for a changed link, a changed or removed photo, or a photo in flight', () => {
    const baseline = { linkUrl: 'https://a.example/', photoAttachmentId: 'p1' };
    const same = { attachmentId: 'p1', settled: true };
    expect(isWishMediaDirty(baseline, 'https://b.example/', same)).toBe(true);
    expect(isWishMediaDirty(baseline, null, same)).toBe(true);
    expect(isWishMediaDirty(baseline, baseline.linkUrl, READY)).toBe(true);
    expect(isWishMediaDirty(baseline, baseline.linkUrl, NONE)).toBe(true);
    expect(isWishMediaDirty(baseline, baseline.linkUrl, UNSETTLED)).toBe(true);
  });
});

describe('wishMediaPatch', () => {
  const baseline = { linkUrl: 'https://a.example/', photoAttachmentId: 'p1' };
  const keep = { attachmentId: 'p1', settled: true };

  it('is empty when nothing changed, so an unrelated edit resends neither field', () => {
    expect(wishMediaPatch(baseline, 'https://a.example/', keep)).toEqual({});
  });

  it('changes only the link and leaves the photo alone', () => {
    expect(wishMediaPatch(baseline, 'https://b.example/', keep)).toEqual({
      linkUrl: 'https://b.example/',
    });
  });

  it('clears only the link with an explicit null', () => {
    const patch = wishMediaPatch(baseline, null, keep);
    expect(patch).toEqual({ linkUrl: null });
    expect('photoAttachmentId' in patch).toBe(false);
  });

  it('clears only the photo with an explicit null', () => {
    const patch = wishMediaPatch(baseline, 'https://a.example/', NONE);
    expect(patch).toEqual({ photoAttachmentId: null });
    expect('linkUrl' in patch).toBe(false);
  });

  it('binds a replacement photo', () => {
    expect(wishMediaPatch(baseline, 'https://a.example/', READY)).toEqual({
      photoAttachmentId: 'photo-2',
    });
  });

  it('never sends a photo change while the photo is unsettled', () => {
    expect(wishMediaPatch(baseline, 'https://a.example/', UNSETTLED)).toEqual(
      {},
    );
  });

  it('adds a first link and a first photo to a bare Wish', () => {
    expect(
      wishMediaPatch(
        { linkUrl: null, photoAttachmentId: null },
        'https://a.example/',
        READY,
      ),
    ).toEqual({ linkUrl: 'https://a.example/', photoAttachmentId: 'photo-2' });
  });
});

describe('wishCreateMedia', () => {
  it('contains only what the couple added', () => {
    expect(wishCreateMedia(null, NONE)).toEqual({});
    expect(wishCreateMedia('https://a.example/', NONE)).toEqual({
      linkUrl: 'https://a.example/',
    });
    expect(wishCreateMedia(null, READY)).toEqual({
      photoAttachmentId: 'photo-2',
    });
  });
});

describe('shared content meeting an existing Wish', () => {
  const photo = new File(['x'], 'hut.jpg', { type: 'image/jpeg' });
  const empty = { linkUrl: null, photoAttachmentId: null };
  const full = { linkUrl: 'https://a.example/', photoAttachmentId: 'p1' };
  const noReplace = { link: false, photo: false };

  it('finds a conflict only for an occupied field that would be overwritten', () => {
    const shared = { linkUrl: 'https://b.example/', photo };
    expect(sharedWishConflicts(empty, shared)).toEqual(noReplace);
    expect(sharedWishConflicts(full, shared)).toEqual({
      link: true,
      photo: true,
    });
    expect(
      sharedWishConflicts(full, { linkUrl: 'https://a.example/' }),
    ).toEqual(noReplace);
    expect(sharedWishConflicts(full, { title: 'Hut' })).toEqual(noReplace);
  });

  it('keeps occupied fields by default and fills empty ones', () => {
    expect(
      mergeSharedWishDraft(
        { description: 'Already here', media: full },
        { description: 'New', linkUrl: 'https://b.example/', photo },
        noReplace,
      ),
    ).toEqual({
      description: 'Already here',
      linkUrl: 'https://a.example/',
      photo: null,
    });
    expect(
      mergeSharedWishDraft(
        { description: '  ', media: empty },
        { description: ' New ', linkUrl: 'https://b.example/', photo },
        noReplace,
      ),
    ).toEqual({ description: 'New', linkUrl: 'https://b.example/', photo });
  });

  it('replaces only the fields the couple chose to replace', () => {
    const shared = { linkUrl: 'https://b.example/', photo };
    expect(
      mergeSharedWishDraft({ description: '', media: full }, shared, {
        link: true,
        photo: false,
      }),
    ).toMatchObject({ linkUrl: 'https://b.example/', photo: null });
    expect(
      mergeSharedWishDraft({ description: '', media: full }, shared, {
        link: false,
        photo: true,
      }),
    ).toMatchObject({ linkUrl: 'https://a.example/', photo });
  });

  it('keeps the existing link when the share carries none', () => {
    expect(
      mergeSharedWishDraft(
        { description: '', media: full },
        { description: 'Text' },
        { link: true, photo: true },
      ),
    ).toEqual({
      description: 'Text',
      linkUrl: 'https://a.example/',
      photo: null,
    });
  });
});

describe('takeSharedWishDraftOnce', () => {
  afterEach(() => {
    releaseTakenSharedWishDraft();
    clearSharedWishDraft('scope');
  });

  it('returns the same draft for a repeated read until it is released', () => {
    const key = stageSharedWishDraft('scope', { title: 'Hut' });
    expect(takeSharedWishDraftOnce('scope', key)).toEqual({ title: 'Hut' });
    expect(takeSharedWishDraftOnce('scope', key)).toEqual({ title: 'Hut' });
    releaseTakenSharedWishDraft();
    expect(takeSharedWishDraftOnce('scope', key)).toBeNull();
  });

  it('does not release a draft staged for another scope', () => {
    const key = stageSharedWishDraft('scope', { title: 'Hut' });
    expect(takeSharedWishDraftOnce('other', key)).toBeNull();
  });
});
