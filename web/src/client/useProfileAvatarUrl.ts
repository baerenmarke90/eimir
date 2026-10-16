import { useEffect, useState } from 'react';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { createOwnedObjectUrl, type OwnedObjectUrl } from './objectUrlResource';

interface SharedAvatarEntry {
  consumers: number;
  resource: OwnedObjectUrl | null;
  pending: Promise<string> | null;
  controller: AbortController | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

const avatarCacheByApi = new WeakMap<
  ProfilesApi,
  Map<string, SharedAvatarEntry>
>();

function avatarCacheKey(
  spaceId: string,
  accountId: string,
  profileAttachmentId: string,
): string {
  return `${spaceId}\u0000${accountId}\u0000${profileAttachmentId}`;
}

function cacheFor(profilesApi: ProfilesApi): Map<string, SharedAvatarEntry> {
  const existing = avatarCacheByApi.get(profilesApi);
  if (existing) return existing;
  const created = new Map<string, SharedAvatarEntry>();
  avatarCacheByApi.set(profilesApi, created);
  return created;
}

function releaseSharedAvatar(
  cache: Map<string, SharedAvatarEntry>,
  key: string,
  entry: SharedAvatarEntry,
): void {
  entry.consumers = Math.max(0, entry.consumers - 1);
  if (entry.consumers > 0 || entry.releaseTimer !== null) return;

  // Defer one task so React StrictMode's effect cleanup/replay and same-turn
  // remounts can retain the in-flight/result URL instead of issuing the same
  // binary request twice. Once no consumer returns, release promptly.
  entry.releaseTimer = setTimeout(() => {
    entry.releaseTimer = null;
    if (entry.consumers > 0) return;
    entry.controller?.abort();
    entry.resource?.dispose();
    cache.delete(key);
  }, 0);
}

function acquireSharedAvatar(
  profilesApi: ProfilesApi,
  spaceId: string,
  accountId: string,
  profileAttachmentId: string,
): {
  entry: SharedAvatarEntry;
  promise: Promise<string>;
  release: () => void;
} {
  const cache = cacheFor(profilesApi);
  const key = avatarCacheKey(spaceId, accountId, profileAttachmentId);
  let entry = cache.get(key);
  if (!entry) {
    entry = {
      consumers: 0,
      resource: null,
      pending: null,
      controller: null,
      releaseTimer: null,
    };
    cache.set(key, entry);
  }

  entry.consumers += 1;
  if (entry.releaseTimer !== null) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  }

  const currentEntry = entry;

  if (!currentEntry.pending && !currentEntry.resource) {
    const controller = new AbortController();
    currentEntry.controller = controller;
    const pending = profilesApi
      .getProfileAvatarContentRaw(
        { accountId, spaceId },
        { signal: controller.signal },
      )
      .then(async (response) => {
        const blob = await response.raw.blob();
        if (controller.signal.aborted) {
          throw new DOMException('Avatar load aborted', 'AbortError');
        }
        const resource = createOwnedObjectUrl(blob);
        currentEntry.resource = resource;
        return resource.url;
      })
      .finally(() => {
        if (currentEntry.pending === pending) currentEntry.pending = null;
        if (currentEntry.controller === controller) {
          currentEntry.controller = null;
        }
      });
    currentEntry.pending = pending;
  }

  const promise = currentEntry.resource
    ? Promise.resolve(currentEntry.resource.url)
    : currentEntry.pending;
  if (!promise) {
    throw new Error('Shared avatar cache entry has no load promise.');
  }

  return {
    entry: currentEntry,
    promise,
    release: () => releaseSharedAvatar(cache, key, currentEntry),
  };
}

export function useProfileAvatarUrl(
  profilesApi: ProfilesApi | undefined | null,
  spaceId: string,
  accountId: string,
  profileAttachmentId: string | null | undefined,
): { avatarUrl: string | null; loadFailed: boolean } {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);

    if (!profilesApi || !profileAttachmentId || !spaceId || !accountId) {
      setAvatarUrl(null);
      return;
    }

    const shared = acquireSharedAvatar(
      profilesApi,
      spaceId,
      accountId,
      profileAttachmentId,
    );
    setAvatarUrl(shared.entry.resource?.url ?? null);

    void shared.promise
      .then((loadedUrl) => {
        if (active) setAvatarUrl(loadedUrl);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setLoadFailed(true);
      });

    return () => {
      active = false;
      shared.release();
    };
  }, [accountId, profileAttachmentId, profilesApi, spaceId]);

  return { avatarUrl, loadFailed };
}
