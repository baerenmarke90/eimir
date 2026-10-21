import { useEffect, useState } from 'react';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { createOwnedObjectUrl, type OwnedObjectUrl } from './objectUrlResource';
import {
  captureMediaCacheLease,
  assertMediaCacheLease,
  loadCachedMediaBlob,
  mediaCacheScopeForClient,
  type MediaCacheScope,
} from './authorizedMediaCache';

interface SharedAvatarEntry {
  consumers: number;
  resource: OwnedObjectUrl | null;
  pending: Promise<string> | null;
  controller: AbortController | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

const avatarCacheByScope = new WeakMap<
  MediaCacheScope,
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
  const scope = mediaCacheScopeForClient(profilesApi);
  const existing = avatarCacheByScope.get(scope);
  if (existing) return existing;
  const created = new Map<string, SharedAvatarEntry>();
  avatarCacheByScope.set(scope, created);
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
    const lease = captureMediaCacheLease(profilesApi, spaceId);
    const pending = loadCachedMediaBlob(
      lease,
      ['profile-avatar', accountId, profileAttachmentId],
      async (signal) => {
        const response = await profilesApi.getProfileAvatarContentRaw(
          { accountId, spaceId },
          { signal },
        );
        return response.raw.blob();
      },
      controller.signal,
    )
      .then((blob) => {
        assertMediaCacheLease(lease);
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
  const scope = profilesApi ? mediaCacheScopeForClient(profilesApi) : null;
  const identity = JSON.stringify([
    scope?.id,
    spaceId,
    accountId,
    profileAttachmentId,
  ]);
  const [state, setState] = useState({
    identity,
    avatarUrl: null as string | null,
    loadFailed: false,
  });

  useEffect(() => {
    let active = true;

    if (!profilesApi || !profileAttachmentId || !spaceId || !accountId) {
      setState({ identity, avatarUrl: null, loadFailed: false });
      return;
    }

    const shared = acquireSharedAvatar(
      profilesApi,
      spaceId,
      accountId,
      profileAttachmentId,
    );
    setState({
      identity,
      avatarUrl: shared.entry.resource?.url ?? null,
      loadFailed: false,
    });

    void shared.promise
      .then((loadedUrl) => {
        if (active)
          setState({ identity, avatarUrl: loadedUrl, loadFailed: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setState({ identity, avatarUrl: null, loadFailed: true });
      });

    return () => {
      active = false;
      shared.release();
    };
  }, [accountId, profileAttachmentId, profilesApi, spaceId, identity]);

  return state.identity === identity && scope?.isCurrent(spaceId)
    ? { avatarUrl: state.avatarUrl, loadFailed: state.loadFailed }
    : { avatarUrl: null, loadFailed: false };
}
