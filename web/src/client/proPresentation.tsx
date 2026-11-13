import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from './apiConfiguration';
import { useApiRuntime } from './apiRuntimeContext';
import {
  entitlementLoader,
  useRecheckSpaceEntitlementOnResume,
  useSpaceEntitlement,
} from './spaceEntitlement';

const ProPresentationContext = createContext<boolean | null>(null);

/**
 * Starts the session's single Space entitlement read as soon as the
 * authenticated shell mounts, before any Pro surface is visited, renews it
 * when the app returns after a pause, and derives
 * the decorative upgrade marks from it. Pro features reuse the same read
 * (`useSpaceCapability`); navigation never triggers another one. The backend
 * still authorizes capabilities and every protected action independently.
 */
export function ProPresentationProvider({ children }: { children: ReactNode }) {
  const runtime = useApiRuntime();
  const instance = runtime?.apiBaseUrl ?? '';
  const accountId = runtime?.accountId ?? '';
  const spaceId = runtime?.spaceId ?? '';
  const accessToken = runtime?.accessToken ?? '';
  const hasOwner = Boolean(instance && accountId && spaceId && accessToken);
  const load = useMemo(
    () =>
      hasOwner
        ? entitlementLoader(
            new EntitlementsApi(
              new Configuration({
                basePath: instance,
                headers: { Authorization: `Bearer ${accessToken}` },
              }),
            ),
            spaceId,
          )
        : undefined,
    [hasOwner, instance, accessToken, spaceId],
  );
  const query = useSpaceEntitlement({ accountId, spaceId, load });
  // Returning after a pause counts as a new start for the Pro check.
  useRecheckSpaceEntitlementOnResume({ accountId, spaceId, enabled: hasOwner });
  // Unknown/new scope never borrows another Space's tier. This controls only
  // decorative upgrade marks, not authorization or the availability of content.
  const hide =
    hasOwner &&
    (query.data?.spaceId !== spaceId || query.data.tier === 'PREMIUM');
  return (
    <ProPresentationContext.Provider value={hide}>
      {children}
    </ProPresentationContext.Provider>
  );
}

export function useHideProFeatureMarks() {
  return useContext(ProPresentationContext) ?? false;
}
