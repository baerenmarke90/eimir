# Object URL ownership contract

**Scope:** Web authorized media and local Blob/File previews  
**Status:** Binding technical contract  
**Issue:** #1070

Object URLs are process-local resources with explicit lifetime. Creating a
`blob:` URL transfers a cleanup responsibility; presentation components must
not invent their own revoke rules when the ownership semantics are the same.

## 1. Ownership classes

### Single-owner resources

Use `OwnedObjectUrl` / `useObjectUrlResource(s)` when one mounted consumer
owns the resource.

- Creation or adoption transfers ownership to exactly one owner.
- Replacing/removing a resource disposes its previous URL exactly once.
- Unmount disposes the final active URL.
- An async result that resolves after replacement or unmount is disposed
  immediately and must not update current state.
- Errors from stale requests must not replace the current resource state.
- `scopeKey + resourceId` defines resource identity. A new callback object
  alone is not a reload reason.
- The hook's `AbortSignal` is best-effort cancellation. Correctness never
  depends on cancellation: a loader that finishes late still transfers its
  result to the hook, which disposes stale results.

Current consumers: Story `MemoryPreview`, `MediaGallery`, and related-person
remote avatars. Local draft/editor previews reuse the same idempotent low-level
owner where their feature-specific lifecycle remains authoritative.

### Shared resources

A shared URL has one central owner and any number of consumers.

- Consumers acquire/release; they never call `URL.revokeObjectURL` directly.
- The central owner revokes only after the last consumer releases.
- Shared caches must define their resource key and release policy.
- React StrictMode cleanup/replay must not revoke a URL that an immediate replay
  still uses.

`useProfileAvatarUrl` is the current shared-resource case. Its existing
per-`ProfilesApi` cache remains reference-counted and reuses
`OwnedObjectUrl` only for final idempotent disposal. #1070 intentionally does
not turn Story media into a global cache.

### Feature-local ephemeral resources

A fully local operation may keep its own lifecycle when sharing would add no
value.

- Transfer downloads create, use, and revoke their URL synchronously in one
  helper.
- Attachment drafts couple preview lifetime to draft generation, upload
  cancellation, removal, and clear. They keep that feature lifecycle while
  using `OwnedObjectUrl` for the preview URL itself.
- Related-person editor file previews are local to the editor and use the
  low-level owner for replacement/unmount cleanup.
- Our Moments setup owns a small batch at the React Query boundary. Partial
  failures/aborts dispose every URL already created; successful batches are
  released when the query consumer leaves, with StrictMode-safe deferred final
  release.

These cases must not be forced through the React single-resource hook because
their higher-level ownership boundary is different.

## 2. Authorized transport boundary

Authorized loaders may return a Blob or an already-created Object URL to the
single-owner resource layer. If a loader returns an Object URL, ownership
transfers on Promise resolution.

Story/reference media loaders accept an `AbortSignal` where practical. Abort
reduces wasted transfer work but does not replace stale-result cleanup.

## 3. Caching policy

There is no repo-wide media cache.

Caching is introduced only for a demonstrated repeated-consumer case with a
clear key, invalidation rule, and final owner. The profile-avatar cache already
meets that requirement. Story Preview/Gallery instead preserve unchanged keyed
resources within the mounted consumer so parent re-renders do not trigger
redundant requests/Object URLs.

## 4. Invariants to test

The shared lifecycle must cover:

1. successful load;
2. current-request error;
3. active URL cleanup on unmount;
4. unmount before async resolve;
5. A -> B replacement;
6. stale A resolving after B;
7. rapid A -> B -> C replacement;
8. stale errors not overwriting current state;
9. no double revoke;
10. final cleanup of all active keyed resources;
11. reference-counted sharing where sharing exists.

UI tests remain responsible for visible Gallery/Preview behavior; lifecycle
tests should stay deterministic at the low-level hook/owner boundary.
