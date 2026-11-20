/**
 * Play registry (Motion Contract M3, M5).
 *
 * Remembers which motion identities have played in which play scope, so a
 * re-render, refetch, remount or kept-tab return never replays one-shot
 * motion. It stores identity strings and opaque keys in memory only: never
 * content, never persisted, logged or sent.
 *
 * - `app-start`: until the app is reloaded or restarted;
 * - `session`: the current app session; `resetMotionSession()` clears it, for
 *   example after a sign-out or an account switch;
 * - `surface`: as long as the owning surface stays mounted (including while
 *   it is hidden in a kept tab). Use a `SurfaceScope` from
 *   `createSurfaceScope()` and `dispose()` it on unmount.
 */
import { useEffect, useRef } from 'react';

export type PlayScope = 'app-start' | 'session' | 'surface';

export interface SurfaceScope {
  readonly played: Map<string, object>;
  dispose(): void;
}

const appStart = new Map<string, object>();
const session = new Map<string, object>();

export function createSurfaceScope(): SurfaceScope {
  const played = new Map<string, object>();
  return { played, dispose: () => played.clear() };
}

/** One surface scope per mounted component, dropped when it unmounts. */
export function useSurfaceScope(): SurfaceScope {
  const scope = useRef<SurfaceScope | null>(null);
  scope.current ??= createSurfaceScope();
  useEffect(() => {
    const current = scope.current;
    return () => current?.dispose();
  }, []);
  return scope.current;
}

/**
 * A `surface` scope without its SurfaceScope is a fresh surface every time
 * (each opening of a sheet is a new identity): nothing is remembered.
 */
function store(scope: PlayScope, surface?: SurfaceScope): Map<string, object> {
  if (scope === 'app-start') return appStart;
  if (scope === 'session') return session;
  return surface?.played ?? new Map();
}

/** True when `identity` already played in this scope. */
export function hasPlayed(
  identity: string,
  scope: PlayScope,
  surface?: SurfaceScope,
): boolean {
  return store(scope, surface).has(identity);
}

/**
 * Claims the one play of `identity` for `owner` (usually a component's ref
 * object). Returns true when `owner` may play it: the identity has not played,
 * or `owner` itself claimed it before (an effect that runs again for the same
 * mounted component, as in React's development double-invoke). A different
 * owner, such as a remounted element, gets false and shows the final state.
 */
export function claimPlay(
  identity: string,
  scope: PlayScope,
  owner: object,
  surface?: SurfaceScope,
): boolean {
  const played = store(scope, surface);
  const holder = played.get(identity);
  if (holder === undefined) {
    played.set(identity, owner);
    return true;
  }
  return holder === owner;
}

/** Records `identity` as played without playing it (shown in final state). */
export function markPlayed(
  identity: string,
  scope: PlayScope,
  surface?: SurfaceScope,
): void {
  const played = store(scope, surface);
  if (!played.has(identity)) played.set(identity, {});
}

/** Forget the session scope (sign-out, account switch). */
export function resetMotionSession(): void {
  session.clear();
}

/** Test support: forget every scope. */
export function resetPlayRegistryForTests(): void {
  appStart.clear();
  session.clear();
}
