import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { normalizeClientError } from './problemDetails';

export const PARTNER_QUICK_ACTIONS_CAPABILITY =
  'partner.quick_actions.extended' as const;
export const PARTNER_QUICK_ACTIONS_ENTITLEMENT_REQUIRED =
  'PREMIUM_ENTITLEMENT_REQUIRED';

export function partnerQuickActionsEntitlementQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['partner-quick-actions', 'entitlement', string, string] {
  return ['partner-quick-actions', 'entitlement', accountId, spaceId] as const;
}

export async function loadPartnerQuickActionsCapability(
  api: EntitlementsApi,
  spaceId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const entitlement =
      await api.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
        { spaceId },
        signal ? { signal } : undefined,
      );
    return entitlement.capabilities.includes(PARTNER_QUICK_ACTIONS_CAPABILITY);
  } catch (error) {
    throw await normalizeClientError(error);
  }
}
