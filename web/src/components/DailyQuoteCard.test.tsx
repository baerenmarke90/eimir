// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DailyQuoteApi } from '../api/generated/apis/DailyQuoteApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DailyQuoteCatalogView } from '../api/generated/models/DailyQuoteCatalogView';
import type { DailyQuotePreferenceView } from '../api/generated/models/DailyQuotePreferenceView';
import type { DailyQuoteResponse } from '../api/generated/models/DailyQuoteResponse';
import { ClientProblemError } from '../client/problemDetails';
import { i18n } from '../i18n';
import dailyQuote from '../i18n/locales/dailyQuote';
import { DailyQuoteCard } from './DailyQuoteCard';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';

const catalog: DailyQuoteCatalogView = {
  categories: [
    {
      id: 'love',
      name: 'Love',
      description: 'Relationship thoughts.',
    },
    {
      id: 'mindfulness',
      name: 'Mindfulness',
      description: 'Present-moment thoughts.',
    },
  ],
  sources: [
    {
      id: 'classic_literature',
      name: 'Classic literature',
      description: 'Curated classic literature',
      rightsClassification: 'PUBLIC_DOMAIN',
    },
    {
      id: 'poetic_wisdom',
      name: 'Poetry and wisdom',
      description: 'Curated aphorisms',
      rightsClassification: 'PUBLIC_DOMAIN',
    },
  ],
};

const quote: DailyQuoteResponse = {
  checkedOn: new Date('2026-09-22T00:00:00.000Z'),
  enabled: true,
  quote: {
    attributionRequired: true,
    authorDisplay: 'Example Author',
    categoryIds: ['love', 'mindfulness'],
    id: 'quote-de-love-002',
    locale: 'de',
    rightsClassification: 'PUBLIC_DOMAIN',
    sourceDisplay: 'Example Source',
    sourceId: 'classic_literature',
    text: 'A server-resolved quote.',
  },
};

const preference: DailyQuotePreferenceView = {
  accountId: ACCOUNT_ID,
  enabled: true,
  locale: null,
  selectedCategoryIds: ['love'],
  selectedSourceIds: ['classic_literature'],
  version: 2,
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

function rawResponse<T>(value: T, etag = '"quote-pref:2"') {
  return {
    raw: new Response(JSON.stringify(value), {
      status: 200,
      headers: { ETag: etag, 'Content-Type': 'application/json' },
    }),
    value: async () => value,
  };
}

function renderCard({
  capabilities = ['daily.quote'],
  quoteResult = quote,
  quoteError,
  entitlementError,
  saveError,
}: {
  capabilities?: string[];
  quoteResult?: DailyQuoteResponse;
  quoteError?: unknown;
  entitlementError?: unknown;
  saveError?: unknown;
} = {}) {
  const getEntitlements = entitlementError
    ? vi.fn().mockRejectedValue(entitlementError)
    : vi.fn().mockResolvedValue({
        spaceId: SPACE_ID,
        status: capabilities.length > 0 ? 'ACTIVE' : 'FREE',
        tier: capabilities.length > 0 ? 'PREMIUM' : 'FREE',
        capabilities,
        isInGracePeriod: false,
      });
  const getDailyQuote = quoteError
    ? vi.fn().mockRejectedValue(quoteError)
    : vi.fn().mockResolvedValue(quoteResult);
  const getDailyQuoteCatalog = vi.fn().mockResolvedValue(catalog);
  const getDailyQuotePreferencesRaw = vi
    .fn()
    .mockResolvedValue(rawResponse(preference));
  const updateDailyQuotePreferencesRaw = saveError
    ? vi.fn().mockRejectedValue(saveError)
    : vi.fn().mockImplementation(
        async ({
          dailyQuotePreferencePatch,
        }: {
          dailyQuotePreferencePatch: {
            selectedCategoryIds?: string[] | null;
            selectedSourceIds?: string[] | null;
          };
        }) =>
          rawResponse(
            {
              ...preference,
              selectedCategoryIds:
                dailyQuotePreferencePatch.selectedCategoryIds ??
                preference.selectedCategoryIds,
              selectedSourceIds:
                dailyQuotePreferencePatch.selectedSourceIds ??
                preference.selectedSourceIds,
              version: preference.version + 1,
            },
            '"quote-pref:3"',
          ),
      );

  const quoteApi = {
    getDailyQuote,
    getDailyQuoteCatalog,
    getDailyQuotePreferencesRaw,
    updateDailyQuotePreferencesRaw,
  } as unknown as DailyQuoteApi;
  const entitlementsApi = {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: getEntitlements,
  } as unknown as EntitlementsApi;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DailyQuoteCard
          quoteApi={quoteApi}
          entitlementsApi={entitlementsApi}
          accountId={ACCOUNT_ID}
          spaceId={SPACE_ID}
          partnerName="Ben"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return {
    getEntitlements,
    getDailyQuote,
    getDailyQuoteCatalog,
    getDailyQuotePreferencesRaw,
    updateDailyQuotePreferencesRaw,
  };
}

describe('DailyQuoteCard', () => {
  it('shows quiet Pro discovery in Free Spaces without requesting a quote', async () => {
    const api = renderCard({ capabilities: [] });

    expect(await screen.findByText(dailyQuote.discovery)).toBeTruthy();
    expect(screen.getByText(dailyQuote.discoveryMeta)).toBeTruthy();
    expect(api.getDailyQuote).not.toHaveBeenCalled();
    expect(api.getDailyQuoteCatalog).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {
        name: dailyQuote.settingsAria,
      }),
    ).not.toBeTruthy();
  });

  it('renders the server-resolved Pro quote with attribution and catalog labels', async () => {
    renderCard();

    expect(await screen.findByText('„A server-resolved quote.“')).toBeTruthy();
    expect(
      screen.getByText(
        i18n.t('dailyQuote.quoteAttribution', {
          author: 'Example Author',
          source: 'Example Source',
        }),
      ),
    ).toBeTruthy();
    expect(screen.getByText('Love')).toBeTruthy();
    expect(screen.getByText('Mindfulness')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: dailyQuote.settingsAria,
      }),
    ).toBeTruthy();
  });

  it('falls back to quiet discovery when Pro is removed between entitlement and quote reads', async () => {
    const entitlementError = new ClientProblemError(
      'permission',
      403,
      'PREMIUM_ENTITLEMENT_REQUIRED',
    );
    renderCard({ quoteError: entitlementError });

    expect(await screen.findByText(dailyQuote.discovery)).toBeTruthy();
    expect(screen.queryByText(dailyQuote.empty)).toBeNull();
  });

  it('renders the neutral no-quote state without error styling or retry', async () => {
    renderCard({
      quoteResult: {
        checkedOn: new Date('2026-09-22T00:00:00.000Z'),
        enabled: true,
        quote: null,
      },
    });

    expect(await screen.findByText(dailyQuote.empty)).toBeTruthy();
    expect(screen.getByText(dailyQuote.emptyMeta)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: dailyQuote.retry }),
    ).not.toBeTruthy();
  });

  it('keeps an offline entitlement failure local to the card and retries it', async () => {
    const user = userEvent.setup();
    const api = renderCard({
      entitlementError: new ClientProblemError('offline', undefined, undefined),
    });

    expect(await screen.findByText(dailyQuote.unavailableOffline)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: dailyQuote.retry }));
    expect(api.getEntitlements).toHaveBeenCalledTimes(2);
  });

  it('keeps a quote read failure local to the card and offers retry', async () => {
    const user = userEvent.setup();
    const api = renderCard({
      quoteError: new ClientProblemError('server', 500, 'QUOTE_UNAVAILABLE'),
    });

    expect(await screen.findByText(dailyQuote.unavailable)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: dailyQuote.retry }));
    expect(api.getDailyQuote).toHaveBeenCalledTimes(2);
  });

  it('keeps the preference draft open on an optimistic concurrency conflict', async () => {
    const user = userEvent.setup();
    const api = renderCard({
      saveError: new ClientProblemError(
        'conflict',
        409,
        'RESOURCE_VERSION_CONFLICT',
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: dailyQuote.settingsAria }),
    );
    await user.click(screen.getByRole('checkbox', { name: /Mindfulness/u }));
    await user.click(screen.getByRole('button', { name: dailyQuote.done }));

    expect(await screen.findByText(dailyQuote.conflict)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Mindfulness/u })).toBeTruthy();
    expect(api.updateDailyQuotePreferencesRaw).toHaveBeenCalledTimes(1);
  });

  it('edits only the caller preference and round-trips the server ETag', async () => {
    const user = userEvent.setup();
    const api = renderCard();

    const settings = await screen.findByRole('button', {
      name: dailyQuote.settingsAria,
    });
    await user.click(settings);

    expect(
      await screen.findByText(i18n.t('dailyQuote.privacy', { name: 'Ben' })),
    ).toBeTruthy();

    const mindfulness = screen.getByRole('checkbox', {
      name: /Mindfulness/u,
    });
    await user.click(mindfulness);
    await user.click(screen.getByRole('button', { name: dailyQuote.done }));

    await waitFor(() =>
      expect(api.updateDailyQuotePreferencesRaw).toHaveBeenCalledTimes(1),
    );
    expect(api.updateDailyQuotePreferencesRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: SPACE_ID,
        ifMatch: '"quote-pref:2"',
        dailyQuotePreferencePatch: expect.objectContaining({
          selectedCategoryIds: ['love', 'mindfulness'],
          selectedSourceIds: ['classic_literature'],
        }),
      }),
      undefined,
    );
    expect(api.getDailyQuotePreferencesRaw).toHaveBeenCalledWith(
      { spaceId: SPACE_ID },
      expect.anything(),
    );
    expect(
      JSON.stringify(api.updateDailyQuotePreferencesRaw.mock.calls),
    ).not.toContain(PARTNER_ID);
  });
});
