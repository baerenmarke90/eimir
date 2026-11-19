import { describe, expect, it, type Mock, vi } from 'vitest';
import type { StorePurchaseResultView } from '../api/generated/models/StorePurchaseResultView';
import { ResponseError } from '../api/generated/runtime';
import type { AvailableBillingChannel } from './proBilling';
import {
  type BillingBackendPort,
  loadGooglePlayChannel,
  type StoreProductOffer,
  type StorePurchasePort,
} from './storeBilling';

const PRODUCTS: StoreProductOffer[] = [
  { basePlanId: 'monthly', offerId: null, amount: 8.49, currency: 'EUR' },
  { basePlanId: 'yearly', offerId: null, amount: 62.99, currency: 'EUR' },
  {
    basePlanId: 'yearly',
    offerId: 'trial',
    offerToken: 'trial-token',
    amount: 0,
    currency: 'EUR',
    trial: { unit: 'day', count: 14 },
  },
];

function problem(status: number, code: string) {
  return new ResponseError(
    new Response(
      JSON.stringify({ status, code, detail: 'x', title: 'x', type: 'x' }),
      { status, headers: { 'Content-Type': 'application/problem+json' } },
    ),
  );
}

function result(outcome: StorePurchaseResultView['outcome']) {
  return { outcome } as StorePurchaseResultView;
}

function setup({
  products = PRODUCTS,
  purchase = vi
    .fn<StorePurchasePort['purchase']>()
    .mockResolvedValue('purchase-token'),
  purchases = vi.fn<StorePurchasePort['purchases']>().mockResolvedValue([]),
  start = vi.fn<BillingBackendPort['start']>().mockResolvedValue({
    purchaseReference: 'opaque-reference',
    storePlanId: 'yearly',
  }),
  submit = vi
    .fn<BillingBackendPort['submit']>()
    .mockResolvedValue(result('confirmed')),
  supported = true,
  channels = [
    {
      store: 'GOOGLE_PLAY' as const,
      productId: 'eimir_pro',
      plans: [
        { plan: 'monthly' as const, storePlanId: 'monthly' },
        { plan: 'yearly' as const, storePlanId: 'yearly' },
      ],
      manageUrl: 'https://play.google.com/store/account/subscriptions',
    },
  ],
}: Partial<{
  products: StoreProductOffer[];
  purchase: Mock<StorePurchasePort['purchase']>;
  purchases: Mock<StorePurchasePort['purchases']>;
  start: Mock<BillingBackendPort['start']>;
  submit: Mock<BillingBackendPort['submit']>;
  supported: boolean;
  channels: Awaited<ReturnType<BillingBackendPort['channels']>>;
}> = {}) {
  const backend: BillingBackendPort = {
    channels: vi.fn().mockResolvedValue(channels),
    start,
    submit,
  };
  const store: StorePurchasePort = {
    supported: vi.fn().mockResolvedValue(supported),
    products: vi.fn().mockResolvedValue(products),
    purchase,
    purchases,
    manage: vi.fn().mockResolvedValue(undefined),
  };
  return { backend, store, purchase, purchases, start, submit };
}

async function available(test: ReturnType<typeof setup>) {
  const channel = await loadGooglePlayChannel(test.backend, test.store);
  expect(channel.kind).toBe('available');
  return channel as AvailableBillingChannel;
}

describe('Google Play channel', () => {
  it('shows the live store prices and an eligible trial, not reference prices', async () => {
    const channel = await available(setup());
    expect(channel.offers).toEqual([
      {
        id: 'yearly',
        amount: 62.99,
        currency: 'EUR',
        period: 'year',
        source: 'provider',
        trial: { unit: 'day', count: 14 },
      },
      {
        id: 'monthly',
        amount: 8.49,
        currency: 'EUR',
        period: 'month',
        source: 'provider',
      },
    ]);
  });

  it('offers nothing without a backend channel (Self-Hosted or unconfigured)', async () => {
    const test = setup({ channels: [] });
    expect(await loadGooglePlayChannel(test.backend, test.store)).toEqual({
      kind: 'unavailable',
      platform: 'native',
    });
    expect(test.store.products).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing base plan', { products: PRODUCTS.slice(1) }],
    ['unsupported billing', { supported: false }],
  ])('reports the store as unavailable for %s', async (_, options) => {
    const test = setup(options);
    expect(await loadGooglePlayChannel(test.backend, test.store)).toEqual({
      kind: 'unavailable',
      platform: 'native',
      reason: 'store',
    });
  });

  it('binds the purchase to the opaque reference and lets the backend verify it', async () => {
    const test = setup();
    const channel = await available(test);
    expect(await channel.purchase('yearly')).toBe('confirmed');
    expect(test.start).toHaveBeenCalledWith('yearly');
    expect(test.purchase).toHaveBeenCalledWith({
      productId: 'eimir_pro',
      basePlanId: 'yearly',
      offerToken: 'trial-token',
      reference: 'opaque-reference',
    });
    expect(test.submit).toHaveBeenCalledWith('purchase-token', false);
  });

  it('buys the base plan when no trial is offered', async () => {
    const test = setup({
      start: vi
        .fn()
        .mockResolvedValue({ purchaseReference: 'r', storePlanId: 'monthly' }),
    });
    await (await available(test)).purchase('monthly');
    expect(test.purchase.mock.calls[0]?.[0]).toMatchObject({
      basePlanId: 'monthly',
      offerToken: undefined,
    });
  });

  it('maps the partner subscription to partnerActive without opening the store', async () => {
    const test = setup({
      start: vi
        .fn()
        .mockRejectedValue(problem(409, 'BILLING_SPACE_ALREADY_PREMIUM')),
    });
    expect(await (await available(test)).purchase('yearly')).toBe(
      'partnerActive',
    );
    expect(test.purchase).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'USER_CANCELED' }, 'cancelled'],
    [{ message: 'Purchase is pending' }, 'pending'],
    [{ code: 'NETWORK_ERROR' }, 'network'],
    [{ code: 'DEVELOPER_ERROR' }, 'failed'],
  ])('maps the store error %j to %s', async (error, outcome) => {
    const test = setup({ purchase: vi.fn().mockRejectedValue(error) });
    expect(await (await available(test)).purchase('yearly')).toBe(outcome);
    expect(test.submit).not.toHaveBeenCalled();
  });

  it('treats an unreachable backend after payment as pending, never as failed', async () => {
    const test = setup({
      submit: vi
        .fn()
        .mockRejectedValue(problem(503, 'BILLING_STORE_UNAVAILABLE')),
    });
    expect(await (await available(test)).purchase('yearly')).toBe('pending');
  });

  it('passes the backend outcome through', async () => {
    const test = setup({
      submit: vi.fn().mockResolvedValue(result('pending')),
    });
    expect(await (await available(test)).purchase('yearly')).toBe('pending');
  });

  it('restores owned purchases and reports when there is nothing to restore', async () => {
    const none = setup();
    expect(await (await available(none)).restore()).toBe('nothingToRestore');

    const owned = setup({
      purchases: vi.fn().mockResolvedValue(['old', 'current']),
      submit: vi
        .fn()
        .mockResolvedValueOnce(result('expired'))
        .mockResolvedValueOnce(result('restored')),
    });
    expect(await (await available(owned)).restore()).toBe('restored');
    expect(owned.submit).toHaveBeenCalledWith('old', true);
    expect(owned.submit).toHaveBeenCalledWith('current', true);
  });

  it('restores instead of failing when Google says the plan is already owned', async () => {
    const test = setup({
      purchase: vi.fn().mockRejectedValue({ code: 'ITEM_ALREADY_OWNED' }),
      purchases: vi.fn().mockResolvedValue(['owned']),
      submit: vi.fn().mockResolvedValue(result('restored')),
    });
    expect(await (await available(test)).purchase('yearly')).toBe('restored');
  });
});
