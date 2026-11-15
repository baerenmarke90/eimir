import { isCapacitorNativePlatform } from './config';

/**
 * eimir. Pro plans and the purchase channel contract (#1892 paywall).
 *
 * The Space entitlement remains the only authority for Pro access. A billing
 * channel only starts a purchase with its provider; access changes after the
 * backend reconciles a grant and the session entitlement read is renewed.
 *
 * No production billing adapter (Stripe for Web, Google Play Billing for the
 * native app) exists yet, so `currentBillingChannel()` reports `unavailable`
 * and the paywall offers no purchase action. There is no simulated purchase,
 * confirmation or local unlock. Adding a provider means implementing
 * `AvailableBillingChannel` for the runtime platform; its offers then replace
 * the reference prices below.
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
  | 'expired';

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
}

export type BillingChannel =
  | { kind: 'unavailable'; platform: 'web' | 'native' }
  | AvailableBillingChannel;

/**
 * The purchase channel for the runtime platform. Web would use Stripe and
 * the native app Google Play Billing; browser-only checkout never appears in
 * the native app. Neither adapter exists yet.
 */
export function currentBillingChannel(): BillingChannel {
  return {
    kind: 'unavailable',
    platform: isCapacitorNativePlatform() ? 'native' : 'web',
  };
}
