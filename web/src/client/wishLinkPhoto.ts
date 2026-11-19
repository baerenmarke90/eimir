import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import { type SharedWishDraft, takeSharedWishDraft } from './sharedWishDraft';

/** Matches the backend limit for one Wish link. */
export const WISH_LINK_MAX_LENGTH = 2048;

export type WishLinkInvalidReason = 'format' | 'scheme' | 'length';

export type WishLinkResult =
  | { kind: 'empty' }
  | { kind: 'valid'; url: string }
  | { kind: 'invalid'; reason: WishLinkInvalidReason };

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const HOST_WITH_PORT = /^[^/?#:@\s]+:\d+(?:[/?#]|$)/;

/**
 * Normalizes one pasted Wish link on the device, without any server fetch:
 * trims it, adds `https://` when the scheme is missing and accepts only
 * `http`/`https` links to a dotted host without embedded credentials.
 */
export function normalizeWishLink(input: string): WishLinkResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };
  if (/\s/u.test(trimmed)) return { kind: 'invalid', reason: 'format' };
  let candidate = trimmed;
  const scheme = SCHEME.exec(trimmed);
  if (scheme && !HOST_WITH_PORT.test(trimmed)) {
    const rest = trimmed.slice(scheme[0].length);
    if (!/^https?$/i.test(scheme[1]) || !rest.startsWith('//'))
      return { kind: 'invalid', reason: 'scheme' };
    candidate = `${scheme[1].toLowerCase()}:${rest}`;
  } else {
    candidate = `https://${trimmed.replace(/^\/+/, '')}`;
  }
  if (candidate.length > WISH_LINK_MAX_LENGTH)
    return { kind: 'invalid', reason: 'length' };
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { kind: 'invalid', reason: 'format' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    return { kind: 'invalid', reason: 'scheme' };
  if (parsed.username || parsed.password)
    return { kind: 'invalid', reason: 'format' };
  if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.'))
    return { kind: 'invalid', reason: 'format' };
  return { kind: 'valid', url: candidate };
}

/** The reading name of a link: its host without a leading `www.`. */
export function wishLinkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

/** A stored link is rendered as a link only when it is a safe web address. */
export function safeWishLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const result = normalizeWishLink(url);
  return result.kind === 'valid' ? result.url : null;
}

/** The two independently editable media of a Wish. */
export interface WishMediaValue {
  linkUrl: string | null;
  photoAttachmentId: string | null;
}

export const EMPTY_WISH_MEDIA: WishMediaValue = {
  linkUrl: null,
  photoAttachmentId: null,
};

export function wishMediaOf(wish: {
  linkUrl?: string | null;
  photoAttachmentId?: string | null;
}): WishMediaValue {
  return {
    linkUrl: wish.linkUrl ?? null,
    photoAttachmentId: wish.photoAttachmentId ?? null,
  };
}

/** What the single photo draft currently amounts to. */
export interface WishPhotoSelection {
  /** The READY attachment to bind, or null for no photo. */
  attachmentId: string | null;
  /** False while a draft is preparing, uploading, validating or failed. */
  settled: boolean;
}

export function resolveWishPhoto(
  itemCount: number,
  readyIds: readonly string[],
): WishPhotoSelection {
  if (itemCount === 0) return { attachmentId: null, settled: true };
  if (itemCount === 1 && readyIds.length === 1)
    return { attachmentId: readyIds[0], settled: true };
  return { attachmentId: null, settled: false };
}

export function isWishMediaDirty(
  baseline: WishMediaValue,
  linkUrl: string | null,
  photo: WishPhotoSelection,
): boolean {
  return (
    linkUrl !== baseline.linkUrl ||
    !photo.settled ||
    photo.attachmentId !== baseline.photoAttachmentId
  );
}

export interface WishMediaPatch {
  linkUrl?: string | null;
  photoAttachmentId?: string | null;
}

/**
 * The media part of a Wish update: only a changed field is present, and an
 * explicit `null` clears it. An unchanged field is never resent, so editing
 * one of them can neither overwrite nor clear the other.
 */
export function wishMediaPatch(
  baseline: WishMediaValue,
  linkUrl: string | null,
  photo: WishPhotoSelection,
): WishMediaPatch {
  const patch: WishMediaPatch = {};
  if (linkUrl !== baseline.linkUrl) patch.linkUrl = linkUrl;
  if (photo.settled && photo.attachmentId !== baseline.photoAttachmentId)
    patch.photoAttachmentId = photo.attachmentId;
  return patch;
}

/** The media part of a new Wish: only what the couple actually added. */
export function wishCreateMedia(
  linkUrl: string | null,
  photo: WishPhotoSelection,
): WishMediaPatch {
  return {
    ...(linkUrl ? { linkUrl } : {}),
    ...(photo.attachmentId ? { photoAttachmentId: photo.attachmentId } : {}),
  };
}

/** A saved Wish photo as the shared photo drafts know it. */
export function wishPhotoSummary(
  attachmentId: string,
): OrderedAttachmentSummary {
  return {
    id: attachmentId,
    position: 0,
    status: 'READY',
    mediaType: 'IMAGE',
    hasThumbnail: false,
    width: null,
    height: null,
    mimeType: null,
    size: null,
  };
}

export interface SharedWishConflicts {
  link: boolean;
  photo: boolean;
}

/** Fields of the existing Wish a shared draft would overwrite. */
export function sharedWishConflicts(
  existing: WishMediaValue,
  shared: SharedWishDraft,
): SharedWishConflicts {
  return {
    link: Boolean(
      existing.linkUrl && shared.linkUrl && existing.linkUrl !== shared.linkUrl,
    ),
    photo: Boolean(existing.photoAttachmentId && shared.photo),
  };
}

export interface SharedWishMerge {
  description: string;
  linkUrl: string | null;
  /** A shared photo to upload through the normal draft pipeline. */
  photo: File | null;
}

/**
 * Merges shared content into an existing Wish editor. An occupied field keeps
 * its value unless the couple chose to replace it; the shared description only
 * fills an empty description, and the shared title never renames a Wish.
 */
export function mergeSharedWishDraft(
  existing: { description: string; media: WishMediaValue },
  shared: SharedWishDraft,
  replace: SharedWishConflicts,
): SharedWishMerge {
  const sharedDescription = shared.description?.trim() ?? '';
  return {
    description: existing.description.trim()
      ? existing.description
      : sharedDescription,
    linkUrl:
      !existing.media.linkUrl || replace.link
        ? (shared.linkUrl ?? existing.media.linkUrl)
        : existing.media.linkUrl,
    photo:
      shared.photo && (!existing.media.photoAttachmentId || replace.photo)
        ? shared.photo
        : null,
  };
}

let takenDraft: { id: string; value: SharedWishDraft | null } | null = null;

/**
 * Reads a staged shared draft once per navigation. React may run an
 * initializer twice in development, so the same key returns the same result
 * until the page releases it.
 */
export function takeSharedWishDraftOnce(
  scope: string,
  key: string,
): SharedWishDraft | null {
  const id = JSON.stringify([scope, key]);
  if (takenDraft?.id !== id)
    takenDraft = { id, value: takeSharedWishDraft(scope, key) };
  return takenDraft.value;
}

export function releaseTakenSharedWishDraft(): void {
  takenDraft = null;
}
