import { type QueryClient, useQuery } from '@tanstack/react-query';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import { normalizeClientError } from './problemDetails';

/**
 * One Account/Space session reads the Space entitlement (tier plus Pro
 * capabilities) once, when the authenticated shell starts. Every Pro surface
 * derives its state from that single read, so opening a tab, a detail route
 * or a sheet never asks the server again.
 *
 * The read is renewed only when:
 * - the app starts again or the active Space/Account changes (the shell
 *   clears the query cache on both);
 * - the previous read failed or never completed (no data yet), on the next
 *   mount, window focus or reconnect;
 * - a server response denies a Pro capability, which removes it from the
 *   session view at once (`withdrawSpaceCapability`).
 *
 * This is presentation state only. The backend continues to authorize every
 * Pro read and action independently.
 */
export type SpaceEntitlementLoader = (
  signal?: AbortSignal,
) => Promise<SpaceEntitlementView>;

export function spaceEntitlementQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['space-entitlement', string, string] {
  return ['space-entitlement', accountId, spaceId] as const;
}

export function entitlementLoader(
  api: EntitlementsApi,
  spaceId: string,
): SpaceEntitlementLoader {
  return (signal) =>
    api.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
      { spaceId },
      signal ? { signal } : undefined,
    );
}

export async function readSpaceEntitlement(
  load: SpaceEntitlementLoader,
  signal?: AbortSignal,
): Promise<SpaceEntitlementView> {
  try {
    return await load(signal);
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

interface SpaceEntitlementOwner {
  accountId: string;
  spaceId: string;
  /** Missing when the surface has no entitlement client; nothing is fetched. */
  load?: SpaceEntitlementLoader;
  /** Lazy surfaces may defer the first read, but still reuse a cached one. */
  enabled?: boolean;
}

function spaceEntitlementQuery({
  accountId,
  spaceId,
  load,
  enabled = true,
}: SpaceEntitlementOwner) {
  return {
    queryKey: spaceEntitlementQueryKey(accountId, spaceId),
    queryFn: ({ signal }: { signal?: AbortSignal }) => {
      if (!load) throw new Error('Space entitlement loader is unavailable');
      return readSpaceEntitlement(load, signal);
    },
    enabled: enabled && Boolean(load && accountId && spaceId),
    // A completed read stays current for the whole session; only missing or
    // failed reads are fetched again by mount, focus or reconnect.
    staleTime: Infinity,
    retry: false,
  } as const;
}

/** The session's entitlement view for the active Space. */
export function useSpaceEntitlement(owner: SpaceEntitlementOwner) {
  return useQuery(spaceEntitlementQuery(owner));
}

/** Whether the session's entitlement view grants `capability`. */
export function useSpaceCapability(
  owner: SpaceEntitlementOwner & { capability: string },
) {
  const { capability } = owner;
  return useQuery({
    ...spaceEntitlementQuery(owner),
    select: (view: SpaceEntitlementView) =>
      view.capabilities.includes(capability),
  });
}

/**
 * The server denied `capability` (for example after a downgrade). Remove it
 * from the session view immediately without another read, so the surface
 * shows its locked state and cannot loop between a cached grant and denials.
 */
export function withdrawSpaceCapability(
  client: QueryClient,
  accountId: string,
  spaceId: string,
  capability: string,
) {
  client.setQueryData<SpaceEntitlementView>(
    spaceEntitlementQueryKey(accountId, spaceId),
    (view) =>
      view && {
        ...view,
        capabilities: view.capabilities.filter((item) => item !== capability),
      },
  );
}
