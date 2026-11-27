import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { GiftCodesApi } from '../api/generated/apis/GiftCodesApi';
import type { GiftCodeRedemptionView } from '../api/generated/models/GiftCodeRedemptionView';
import { isCapacitorNative } from '../pwa';
import { Configuration } from './apiConfiguration';
import { useApiRuntime } from './apiRuntimeContext';
import {
  type ClientProblemError,
  normalizeClientError,
} from './problemDetails';
import { spaceEntitlementQueryKey } from './spaceEntitlement';
import { instanceStatusQueryOptions } from './supportReportsAvailability';

/** Couple-side redemption of eimir. gift codes (part 5, #2328). */

export type GiftCodeRedeemer = Pick<GiftCodesApi, 'redeemGiftCode'>;

/** What the redeem sheet tells the couple after a refused attempt. */
export type GiftCodeProblem =
  | 'invalid'
  | 'used'
  | 'subscriptionActive'
  | 'unlimited'
  | 'rateLimited'
  | 'network';

const PROBLEMS_BY_CODE: Readonly<Record<string, GiftCodeProblem>> = {
  GIFT_CODE_INVALID: 'invalid',
  GIFT_CODE_USED: 'used',
  GIFT_CODE_SUBSCRIPTION_ACTIVE: 'subscriptionActive',
  GIFT_CODE_UNLIMITED: 'unlimited',
  RATE_LIMITED: 'rateLimited',
};

/**
 * The server's problem code decides the message. A refused body (for example
 * a code longer than the field allows) reads as an invalid code; everything
 * else, offline included, is a passing failure the couple can retry.
 */
export function giftCodeProblem(error: ClientProblemError): GiftCodeProblem {
  const known = error.code ? PROBLEMS_BY_CODE[error.code] : undefined;
  if (known) return known;
  if (error.kind === 'rateLimit') return 'rateLimited';
  if (error.kind === 'validation') return 'invalid';
  return 'network';
}

/** The entry is offered only to the web: redemption in the Android app waits for a payments-policy check. */
export function giftCodeEntryAllowedOnPlatform(): boolean {
  return !isCapacitorNative();
}

/**
 * True only for a signed-in Space session in the browser on an instance whose
 * redeem route exists (eimir. Cloud with the Pro plugin). Unknown, loading and
 * failed status read as false, like the support report entry. The native app
 * never shows the entry, decided by platform, not viewport.
 */
export function useGiftCodesAvailable(): boolean {
  const runtime = useApiRuntime();
  const allowed = Boolean(
    runtime?.accountId && runtime.spaceId && giftCodeEntryAllowedOnPlatform(),
  );
  const status = useQuery({
    ...instanceStatusQueryOptions(runtime?.apiBaseUrl ?? ''),
    enabled: allowed,
  });
  return allowed && status.data?.giftCodesAvailable === true;
}

/**
 * Redeems a code for the Space. A confirmed code renews the session's single
 * entitlement read, so the Pro page and every Pro surface show the new state.
 * Errors arrive normalized as `ClientProblemError`.
 */
export function useRedeemGiftCode(spaceId: string, api?: GiftCodeRedeemer) {
  const runtime = useApiRuntime();
  const queryClient = useQueryClient();
  const basePath = runtime?.apiBaseUrl ?? '';
  const accessToken = runtime?.accessToken ?? '';
  const accountId = runtime?.accountId ?? '';
  const redeemer = useMemo<GiftCodeRedeemer>(
    () =>
      api ??
      new GiftCodesApi(
        new Configuration({
          basePath,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [api, basePath, accessToken],
  );
  return useMutation<GiftCodeRedemptionView, ClientProblemError, string>({
    mutationFn: async (code) => {
      try {
        return await redeemer.redeemGiftCode({
          spaceId,
          giftCodeRedeemRequest: { code },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onError: (error) => {
      // A missing route means redemption was switched off here mid-session:
      // renew the status so the entry is gone once the sheet closes.
      if (error.kind === 'notFound')
        void queryClient.invalidateQueries({
          queryKey: instanceStatusQueryOptions(basePath).queryKey,
        });
    },
    onSuccess: () => {
      if (!accountId) return;
      void queryClient.invalidateQueries({
        queryKey: spaceEntitlementQueryKey(accountId, spaceId),
      });
    },
  });
}
