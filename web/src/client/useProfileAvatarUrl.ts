import { useEffect, useState } from 'react';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';

interface SharedAvatarEntry {
  consumers: number;
  objectUrl: string | null;
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
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
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
      objectUrl: null,
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

  if (!entry.pending && !entry.objectUrl) {
    const controller = new AbortController();
    entry.controller = controller;
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
        const objectUrl = URL.createObjectURL(blob);
        entry!.objectUrl = objectUrl;
        return objectUrl;
      })
      .finally(() => {
        if (entry!.pending === pending) entry!.pending = null;
        if (entry!.controller === controller) entry!.controller = null;
      });
    entry.pending = pending;
  }

  return {
    entry,
    promise: entry.objectUrl
      ? Promise.resolve(entry.objectUrl)
      : (entry.pending as Promise<string>),
    release: () => releaseSharedAvatar(cache, key, entry!),
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
    setAvatarUrl(shared.entry.objectUrl);

    void shared.promise
      .then((loadedUrl) => {
        if (active) setAvatarUrl(loadedUrl);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadFailed(true);
      });

    return () => {
      active = false;
      shared.release();
    };
  }, [accountId, profileAttachmentId, profilesApi, spaceId]);

  return { avatarUrl, loadFailed };
}
