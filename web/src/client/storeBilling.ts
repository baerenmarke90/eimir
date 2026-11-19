import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { BillingApi } from '../api/generated/apis/BillingApi';
import type { StoreChannelView } from '../api/generated/models/StoreChannelView';
import type { StorePurchaseResultView } from '../api/generated/models/StorePurchaseResultView';
import { Configuration } from './apiConfiguration';
import { useApiRuntime } from './apiRuntimeContext';
import { isAndroidApp } from './config';
import {
  type AvailableBillingChannel,
  type BillingChannel,
  currentBillingChannel,
  type ProPlanId,
  type ProPlanOffer,
  type ProPurchaseOutcome,
} from './proBilling';
import { normalizeClientError } from './problemDetails';

/**
 * Google Play Billing for the Android app (#1525).
 *
 * The store sheet is native (`@capgo/native-purchases`, Play Billing Library);
 * the paywall stays the shared React page. The flow never decides Pro access:
 *
 * 1. the backend binds the sponsor and Space to an opaque purchase reference;
 * 2. Google Play takes the payment, receiving only that reference;
 * 3. the backend verifies the purchase token with Google, records the Space
 *    grant and acknowledges the purchase (the app never acknowledges);
 * 4. the paywall renews the session entitlement read once.
 */

export interface StoreProductOffer {
  /** Google Play base plan ID. */
  basePlanId: string;
  /** `null` for the base plan itself; set for an offer such as a trial. */
  offerId: string | null;
  offerToken?: string;
  amount: number;
  currency: string;
  trial?: ProPlanOffer['trial'];
}

/** The native store, reduced to what the paywall needs; tests replace it. */
export interface StorePurchasePort {
  supported: () => Promise<boolean>;
  products: (productId: string) => Promise<StoreProductOffer[]>;
  /** Resolves with the purchase token; rejects with the store's error. */
  purchase: (request: {
    productId: string;
    basePlanId: string;
    offerToken?: string;
    reference: string;
  }) => Promise<string | undefined>;
  /** Purchase tokens the signed-in store account owns for this product. */
  purchases: (productId: string) => Promise<string[]>;
  manage: () => Promise<void>;
}

export interface BillingBackendPort {
  channels: () => Promise<StoreChannelView[]>;
  start: (
    plan: ProPlanId,
  ) => Promise<{ purchaseReference: string; storePlanId: string }>;
  submit: (
    purchaseToken: string,
    restore: boolean,
  ) => Promise<StorePurchaseResultView>;
}

const PLAN_ORDER: readonly ProPlanId[] = ['yearly', 'monthly'];
const UNITS = ['day', 'week', 'month', 'year'] as const;

function storeErrorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (typeof code === 'string' && code) return code;
    if (typeof message === 'string' && /pending/i.test(message))
      return 'PENDING';
  }
  return 'UNKNOWN';
}

function outcomeOf(result: StorePurchaseResultView): ProPurchaseOutcome {
  return result.outcome;
}

async function submitToken(
  backend: BillingBackendPort,
  token: string,
  restore: boolean,
): Promise<ProPurchaseOutcome> {
  try {
    return outcomeOf(await backend.submit(token, restore));
  } catch (error) {
    const problem = await normalizeClientError(error);
    // Google already has the payment; the backend reconciles it from Google's
    // notification, so the honest state is "still being confirmed".
    if (problem.kind === 'offline' || problem.kind === 'server')
      return 'pending';
    return 'failed';
  }
}

const RESTORE_PRIORITY: readonly ProPurchaseOutcome[] = [
  'restored',
  'confirmed',
  'pending',
  'expired',
  'failed',
];

async function restoreAll(
  backend: BillingBackendPort,
  store: StorePurchasePort,
  productId: string,
): Promise<ProPurchaseOutcome> {
  let tokens: string[];
  try {
    tokens = await store.purchases(productId);
  } catch {
    return 'network';
  }
  if (tokens.length === 0) return 'nothingToRestore';
  const results: ProPurchaseOutcome[] = [];
  for (const token of tokens)
    results.push(await submitToken(backend, token, true));
  return (
    RESTORE_PRIORITY.find((outcome) => results.includes(outcome)) ?? 'failed'
  );
}

/**
 * Builds the Google Play channel from the backend's offer and the store's
 * live prices. Anything incomplete yields `unavailable`, never a guessed price.
 */
export async function loadGooglePlayChannel(
  backend: BillingBackendPort,
  store: StorePurchasePort,
): Promise<BillingChannel> {
  const unavailable: BillingChannel = {
    kind: 'unavailable',
    platform: 'native',
  };
  let play: StoreChannelView | undefined;
  try {
    play = (await backend.channels()).find(
      (channel) => channel.store === 'GOOGLE_PLAY',
    );
  } catch {
    return { ...unavailable, reason: 'store' };
  }
  if (!play) return unavailable;
  const { productId } = play;

  let products: StoreProductOffer[];
  try {
    if (!(await store.supported())) return { ...unavailable, reason: 'store' };
    products = await store.products(productId);
  } catch {
    return { ...unavailable, reason: 'store' };
  }

  const offers: ProPlanOffer[] = [];
  const trialTokens = new Map<ProPlanId, string>();
  for (const id of PLAN_ORDER) {
    const basePlanId = play.plans.find((plan) => plan.plan === id)?.storePlanId;
    const base = products.find(
      (product) =>
        product.basePlanId === basePlanId && product.offerId === null,
    );
    if (!basePlanId || !base || !(base.amount > 0))
      return { ...unavailable, reason: 'store' };
    // Google lists only the offers this customer is eligible for.
    const trial = products.find(
      (product) =>
        product.basePlanId === basePlanId &&
        product.offerId !== null &&
        product.trial &&
        product.offerToken,
    );
    if (trial?.offerToken) trialTokens.set(id, trial.offerToken);
    offers.push({
      id,
      amount: base.amount,
      currency: base.currency,
      period: id === 'yearly' ? 'year' : 'month',
      source: 'provider',
      ...(trial?.trial ? { trial: trial.trial } : {}),
    });
  }

  const channel: AvailableBillingChannel = {
    kind: 'available',
    offers,
    purchase: async (plan) => {
      let started: { purchaseReference: string; storePlanId: string };
      try {
        started = await backend.start(plan);
      } catch (error) {
        const problem = await normalizeClientError(error);
        if (problem.code === 'BILLING_SPACE_ALREADY_PREMIUM')
          return 'partnerActive';
        if (problem.kind === 'offline' || problem.kind === 'server')
          return 'network';
        return 'failed';
      }
      let token: string | undefined;
      try {
        token = await store.purchase({
          productId,
          basePlanId: started.storePlanId,
          offerToken: trialTokens.get(plan),
          reference: started.purchaseReference,
        });
      } catch (error) {
        const code = storeErrorCode(error);
        if (code === 'USER_CANCELED') return 'cancelled';
        if (code === 'PENDING') return 'pending';
        if (code === 'ITEM_ALREADY_OWNED')
          return restoreAll(backend, store, productId);
        if (
          code === 'NETWORK_ERROR' ||
          code === 'SERVICE_DISCONNECTED' ||
          code === 'SERVICE_UNAVAILABLE'
        )
          return 'network';
        return 'failed';
      }
      if (!token) return 'failed';
      return submitToken(backend, token, false);
    },
    restore: () => restoreAll(backend, store, productId),
    manage: store.manage,
  };
  return channel;
}

function trialFrom(value: unknown): ProPlanOffer['trial'] {
  if (!value || typeof value !== 'object') return undefined;
  const discount = value as {
    price?: unknown;
    numberOfPeriods?: unknown;
    subscriptionPeriod?: { numberOfUnits?: unknown; unit?: unknown };
  };
  const units = discount.subscriptionPeriod?.numberOfUnits;
  const unit = discount.subscriptionPeriod?.unit;
  const periods =
    typeof discount.numberOfPeriods === 'number' && discount.numberOfPeriods > 0
      ? discount.numberOfPeriods
      : 1;
  if (
    discount.price !== 0 ||
    typeof units !== 'number' ||
    units <= 0 ||
    typeof unit !== 'number' ||
    !UNITS[unit]
  )
    return undefined;
  return { unit: UNITS[unit], count: units * periods };
}

/** `@capgo/native-purchases`, loaded only inside the Android app. */
export async function nativeStore(): Promise<StorePurchasePort> {
  const { NativePurchases, PURCHASE_TYPE } = await import(
    '@capgo/native-purchases'
  );
  return {
    supported: async () =>
      (await NativePurchases.isBillingSupported()).isBillingSupported,
    products: async (productId) =>
      (
        await NativePurchases.getProducts({
          productIdentifiers: [productId],
          productType: PURCHASE_TYPE.SUBS,
        })
      ).products.map((product) => ({
        basePlanId: product.identifier,
        offerId: product.offerId ?? null,
        offerToken: product.offerToken,
        amount: product.price,
        currency: product.currencyCode,
        trial: product.offerId
          ? trialFrom(product.introductoryPrice)
          : undefined,
      })),
    purchase: async ({ productId, basePlanId, offerToken, reference }) =>
      (
        await NativePurchases.purchaseProduct({
          productIdentifier: productId,
          planIdentifier: basePlanId,
          offerToken,
          productType: PURCHASE_TYPE.SUBS,
          // Sent to Google as the obfuscated account ID: random, no PII.
          appAccountToken: reference,
          // The backend acknowledges after verifying the purchase.
          autoAcknowledgePurchases: false,
        })
      ).purchaseToken,
    purchases: async (productId) =>
      (
        await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS })
      ).purchases
        .filter((purchase) => purchase.productIdentifier === productId)
        .map((purchase) => purchase.purchaseToken)
        .filter((token): token is string => Boolean(token)),
    manage: () => NativePurchases.manageSubscriptions(),
  };
}

export function billingBackend(
  api: BillingApi,
  spaceId: string,
): BillingBackendPort {
  return {
    channels: async () =>
      (
        await api.getBillingChannelsApiV1SpacesSpaceIdBillingChannelsGet({
          spaceId,
        })
      ).channels,
    start: (plan) =>
      api.startStorePurchaseApiV1SpacesSpaceIdBillingPurchasesPost({
        spaceId,
        storePurchaseStartRequest: { store: 'GOOGLE_PLAY', plan },
      }),
    submit: (purchaseToken, restore) =>
      api.submitGooglePlayPurchaseApiV1SpacesSpaceIdBillingGooglePlayPurchasesPost(
        {
          spaceId,
          storePurchaseSubmitRequest: { purchaseToken, restore },
        },
      ),
  };
}

/**
 * The paywall's channel: an injected test channel, or the runtime platform's.
 * The Android channel is loaded once per session scope and kept; opening the
 * paywall again reuses it.
 */
export function useBillingChannel(injected?: BillingChannel): {
  channel: BillingChannel;
  retry: () => void;
} {
  const runtime = useApiRuntime();
  const instance = runtime?.apiBaseUrl ?? '';
  const accountId = runtime?.accountId ?? '';
  const spaceId = runtime?.spaceId ?? '';
  const accessToken = runtime?.accessToken ?? '';
  const initial = useMemo(
    () => injected ?? currentBillingChannel(),
    [injected],
  );
  const enabled =
    !injected &&
    initial.kind === 'loading' &&
    isAndroidApp() &&
    Boolean(instance && accountId && spaceId && accessToken);
  const query = useQuery({
    queryKey: ['billing-channel', accountId, spaceId] as const,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () =>
      loadGooglePlayChannel(
        billingBackend(
          new BillingApi(
            new Configuration({
              basePath: instance,
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
          ),
          spaceId,
        ),
        await nativeStore(),
      ),
  });
  if (injected) return { channel: injected, retry: () => undefined };
  if (!enabled) {
    return {
      channel:
        initial.kind === 'loading'
          ? { kind: 'unavailable', platform: 'native' }
          : initial,
      retry: () => undefined,
    };
  }
  return {
    channel:
      query.data ??
      (query.isError
        ? { kind: 'unavailable', platform: 'native', reason: 'store' }
        : { kind: 'loading' }),
    retry: () => void query.refetch(),
  };
}
