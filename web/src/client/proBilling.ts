import { isAndroidApp, isCapacitorNativePlatform } from './config';

/**
 * eimir. Pro plans and the purchase channel contract (#1892 paywall).
 *
 * The Space entitlement remains the only authority for Pro access. A billing
 * channel only starts a purchase with its provider; access changes after the
 * backend reconciles a grant and the session entitlement read is renewed.
 *
 * Purchases are in-app only (Product Owner, 2026-11-15): Google Play Billing
 * in the Android app now, Apple In-App Purchase when the iOS app launches, no
 * browser checkout. The Android channel is loaded by `storeBilling.ts`; its
 * live store offers replace the reference prices below. The browser and the
 * iOS app report `unavailable` and show no purchase action: there is no
 * simulated purchase, confirmation or local unlock.
 */

export type ProPlanId = 'yearly' | 'monthly';

export interface ProPlanOffer {
  id: ProPlanId;
  /** Gross amount in `currency`, as offered to the customer. */
  amount: number;
  currency: string;
  period: 'year' | 'month';
  /** `reference` = PO target price; `provider` = live billing offer. */
  source: 'reference' | 'provider';
  /** Free trial the store currently offers this customer, if any. */
  trial?: { unit: 'day' | 'week' | 'month' | 'year'; count: number };
}

/** Product Owner target prices per Space (supersedes #876 reference prices). */
export const REFERENCE_PRO_PLANS: readonly ProPlanOffer[] = [
  {
    id: 'yearly',
    amount: 59.99,
    currency: 'EUR',
    period: 'year',
    source: 'reference',
  },
  {
    id: 'monthly',
    amount: 7.99,
    currency: 'EUR',
    period: 'month',
    source: 'reference',
  },
];

/** Whole-percent saving of the yearly plan versus twelve monthly payments. */
export function yearlySavingPercent(offers: readonly ProPlanOffer[]): number {
  const yearly = offers.find((offer) => offer.id === 'yearly');
  const monthly = offers.find((offer) => offer.id === 'monthly');
  if (!yearly || !monthly || monthly.amount <= 0) return 0;
  return Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100);
}

/**
 * Every result a real provider flow must map to. `confirmed` and `restored`
 * mean the backend already reports the Space capability; `partnerActive`
 * means the other partner's purchase already covers this Space.
 */
export type ProPurchaseOutcome =
  | 'confirmed'
  | 'cancelled'
  | 'pending'
  | 'failed'
  | 'network'
  | 'restored'
  | 'partnerActive'
  | 'expired'
  | 'nothingToRestore';

/** Outcomes after which the requested feature is usable right away. */
export function unlocksFeature(outcome: ProPurchaseOutcome): boolean {
  return (
    outcome === 'confirmed' ||
    outcome === 'restored' ||
    outcome === 'partnerActive'
  );
}

export interface AvailableBillingChannel {
  kind: 'available';
  /** Live offers from the provider; never invented client-side. */
  offers: readonly ProPlanOffer[];
  /** Starts the provider flow; sends no relationship content. */
  purchase: (plan: ProPlanId) => Promise<ProPurchaseOutcome>;
  restore: () => Promise<ProPurchaseOutcome>;
  /** Opens the store's own subscription management (cancel, change). */
  manage?: () => Promise<void>;
}

export type BillingChannel =
  | { kind: 'loading' }
  | {
      kind: 'unavailable';
      platform: 'web' | 'native';
      /** `store`: the store could not be reached or offers nothing now. */
      reason?: 'store';
    }
  | AvailableBillingChannel;

/**
 * The purchase channel to start with on the runtime platform: the Android app
 * loads Google Play (`loading`); the browser and the iOS app have none. The
 * runtime platform decides, never the viewport width.
 */
export function currentBillingChannel(): BillingChannel {
  if (isAndroidApp()) return { kind: 'loading' };
  return {
    kind: 'unavailable',
    platform: isCapacitorNativePlatform() ? 'native' : 'web',
  };
}
