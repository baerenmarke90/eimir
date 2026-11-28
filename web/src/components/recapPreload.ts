import { useEffect, useRef } from 'react';
import type { OwnedObjectUrl } from '../client/objectUrlResource';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  loadAuthorizedStoryImageResource,
  type StoryMediaParentType,
} from '../client/storyMediaLoader';
import { loadVideoSource } from '../client/video';

/** One picture or clip a recap page shows, in the variant the page reads. */
export type RecapPreload = {
  parentType: StoryMediaParentType;
  parentId: string;
  attachmentId: string;
  /** `clip` warms a video's playback; its poster is a separate `thumbnail`. */
  variant: 'original' | 'thumbnail' | 'clip';
  clipStartSeconds?: number;
};

type ClipParent = 'MEMORY' | 'HEART_MOMENT';

type ClipEntry = {
  users: number;
  controller: AbortController;
  ready: Promise<HTMLVideoElement>;
  element: HTMLVideoElement | null;
};

// Clips are scoped by the authorized API client, so a new login never reuses
// another session's playback grant.
const clipPools = new WeakMap<object, Map<string, ClipEntry>>();

function disposeClip(entry: ClipEntry): void {
  entry.controller.abort();
  const element = entry.element;
  if (!element) return;
  element.pause();
  element.remove();
  element.removeAttribute('src');
  element.load();
}

export type ClipLease = {
  ready: Promise<HTMLVideoElement>;
  release: () => void;
};

/**
 * A muted clip element that starts buffering before its scene is shown. The
 * scene adopts the same element, so the bytes already buffered are played
 * instead of being requested again.
 */
export function acquireRecapClip(
  apis: ReferenceApis,
  spaceId: string,
  parentType: ClipParent,
  parentId: string,
  attachmentId: string,
  startSeconds: number,
): ClipLease {
  let pool = clipPools.get(apis.attachments);
  if (!pool) {
    pool = new Map();
    clipPools.set(apis.attachments, pool);
  }
  const key = JSON.stringify([spaceId, parentType, parentId, attachmentId]);
  let entry = pool.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: ClipEntry = {
      users: 0,
      controller,
      element: null,
      ready: loadVideoSource(
        apis,
        spaceId,
        parentType,
        parentId,
        attachmentId,
        controller.signal,
      ).then((source) => {
        controller.signal.throwIfAborted();
        const element = document.createElement('video');
        element.muted = true;
        element.defaultMuted = true;
        element.playsInline = true;
        element.preload = 'auto';
        element.addEventListener(
          'loadedmetadata',
          () => {
            // Buffer from the clip's own start, not from the file's beginning.
            if (element.currentTime < startSeconds)
              element.currentTime = startSeconds;
          },
          { once: true },
        );
        element.src = source.url;
        created.element = element;
        return element;
      }),
    };
    // A failed grant leaves the poster; the next scene may ask again.
    created.ready.catch(() => {
      if (pool.get(key) === created) pool.delete(key);
    });
    entry = created;
    pool.set(key, entry);
  }
  const held = entry;
  held.users += 1;
  let released = false;
  return {
    ready: held.ready,
    release: () => {
      if (released) return;
      released = true;
      held.users -= 1;
      if (held.users > 0) return;
      if (pool.get(key) === held) pool.delete(key);
      disposeClip(held);
    },
  };
}

type Held = {
  controller: AbortController;
  resource: OwnedObjectUrl | null;
  clip: ClipLease | null;
};

function releaseHeld(held: Held): void {
  held.controller.abort();
  held.resource?.dispose();
  held.resource = null;
  held.clip?.release();
  held.clip = null;
}

function preloadKey(item: RecapPreload): string {
  return JSON.stringify([
    item.parentType,
    item.parentId,
    item.attachmentId,
    item.variant,
  ]);
}

/** Pages around the current one whose media stays ready for an instant turn. */
const BEHIND = 1;
const AHEAD = 2;

/**
 * Keeps the media of the neighbouring pages loaded and decoded while the
 * reader plays (PO 2026-11-28). The bytes usually come from the authorized
 * media store; holding the decoded object URL lets the next page render its
 * picture in its first frame. Only the pages around the current one are held,
 * so decoded memory stays bounded for long year films.
 */
export function useRecapPreload({
  pages,
  page,
  mediaApis,
  spaceId,
  reducedMotion,
}: {
  pages: readonly (readonly RecapPreload[])[];
  page: number;
  mediaApis: ReferenceApis;
  spaceId: string;
  reducedMotion: boolean;
}): void {
  const held = useRef(new Map<string, Held>());
  const wanted = new Map<string, RecapPreload>();
  for (
    let index = Math.max(0, page - BEHIND);
    index <= Math.min(pages.length - 1, page + AHEAD);
    index += 1
  )
    for (const item of pages[index] ?? [])
      if (!(reducedMotion && item.variant === 'clip'))
        wanted.set(preloadKey(item), item);
  const signature = JSON.stringify([spaceId, ...wanted.keys()]);
  const latest = useRef(wanted);
  latest.current = wanted;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature names every wanted item; `latest` carries them.
  useEffect(() => {
    const items = latest.current;
    for (const [key, entry] of held.current)
      if (!items.has(key)) {
        releaseHeld(entry);
        held.current.delete(key);
      }
    for (const [key, item] of items) {
      if (held.current.has(key)) continue;
      const entry: Held = {
        controller: new AbortController(),
        resource: null,
        clip: null,
      };
      held.current.set(key, entry);
      if (item.variant === 'clip') {
        if (item.parentType !== 'MEMORY' && item.parentType !== 'HEART_MOMENT')
          continue;
        entry.clip = acquireRecapClip(
          mediaApis,
          spaceId,
          item.parentType,
          item.parentId,
          item.attachmentId,
          item.clipStartSeconds ?? 0,
        );
        entry.clip.ready.catch(() => undefined);
        continue;
      }
      loadAuthorizedStoryImageResource(
        mediaApis,
        spaceId,
        item.parentType,
        item.parentId,
        item.attachmentId,
        { signal: entry.controller.signal, variant: item.variant },
      )
        .then((resource) => {
          if (entry.controller.signal.aborted) {
            resource.dispose();
            return;
          }
          entry.resource = resource;
          // Decode ahead too, so the page turn does not wait for the decoder.
          const image = new Image();
          image.src = resource.url;
          void image.decode().catch(() => undefined);
        })
        // A page that cannot preload still loads and reports on its own.
        .catch(() => undefined);
    }
  }, [signature, mediaApis]);
  useEffect(() => {
    const current = held.current;
    return () => {
      for (const entry of current.values()) releaseHeld(entry);
      current.clear();
    };
  }, []);
}
