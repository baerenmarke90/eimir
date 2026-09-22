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
import { DailyQuoteCard } from './DailyQuoteCard';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';

const catalog: DailyQuoteCatalogView = {
  categories: [
    {
      id: 'love',
      name: 'Liebe & Beziehung',
      description: 'Gedanken über Nähe.',
    },
    {
      id: 'mindfulness',
      name: 'Achtsamkeit',
      description: 'Gedanken über den Moment.',
    },
  ],
  sources: [
    {
      id: 'classic_literature',
      name: 'Klassische Literatur',
      description: 'Werke der klassischen Weltliteratur',
      rightsClassification: 'PUBLIC_DOMAIN',
    },
    {
      id: 'poetic_wisdom',
      name: 'Poesie & Lebensweisheiten',
      description: 'Klassische Aphorismen',
      rightsClassification: 'PUBLIC_DOMAIN',
    },
  ],
};

const quote: DailyQuoteResponse = {
  checkedOn: new Date('2026-09-22T00:00:00.000Z'),
  enabled: true,
  quote: {
    attributionRequired: true,
    authorDisplay: 'Johann Wolfgang von Goethe',
    categoryIds: ['love', 'mindfulness'],
    id: 'quote-de-love-002',
    locale: 'de',
    rightsClassification: 'PUBLIC_DOMAIN',
    sourceDisplay: 'Faust I',
    sourceId: 'classic_literature',
    text: 'Es muss von Herzen gehen, was auf Herzen wirken soll.',
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
}: {
  capabilities?: string[];
  quoteResult?: DailyQuoteResponse;
  quoteError?: unknown;
} = {}) {
  const getEntitlements = vi.fn().mockResolvedValue({
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
  const updateDailyQuotePreferencesRaw = vi.fn().mockImplementation(
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

    expect(
      await screen.findByText('Ein kleiner täglicher Impuls, der zu dir passt.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Mit eimir. Pro verfügbar.')).toBeInTheDocument();
    expect(api.getDailyQuote).not.toHaveBeenCalled();
    expect(api.getDailyQuoteCatalog).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {
        name: 'Deine Einstellungen für das Zitat des Tages öffnen',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders the server-resolved Pro quote with attribution and catalog labels', async () => {
    renderCard();

    expect(
      await screen.findByText(
        '„Es muss von Herzen gehen, was auf Herzen wirken soll.“',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('— Johann Wolfgang von Goethe, Faust I'),
    ).toBeInTheDocument();
    expect(screen.getByText('Liebe & Beziehung')).toBeInTheDocument();
    expect(screen.getByText('Achtsamkeit')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Deine Einstellungen für das Zitat des Tages öffnen',
      }),
    ).toBeInTheDocument();
  });

  it('falls back to quiet discovery when Pro is removed between entitlement and quote reads', async () => {
    const entitlementError = new ClientProblemError(
      'permission',
      403,
      'PREMIUM_ENTITLEMENT_REQUIRED',
    );
    renderCard({ quoteError: entitlementError });

    expect(
      await screen.findByText('Ein kleiner täglicher Impuls, der zu dir passt.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Heute ist kein Zitat verfügbar.')).not.toBeInTheDocument();
  });

  it('renders the neutral no-quote state without error styling or retry', async () => {
    renderCard({
      quoteResult: {
        checkedOn: new Date('2026-09-22T00:00:00.000Z'),
        enabled: true,
        quote: null,
      },
    });

    expect(
      await screen.findByText('Heute ist kein Zitat verfügbar.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Morgen gibt es wieder einen neuen Impuls.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Erneut versuchen' }),
    ).not.toBeInTheDocument();
  });

  it('edits only the caller preference and round-trips the server ETag', async () => {
    const user = userEvent.setup();
    const api = renderCard();

    const settings = await screen.findByRole('button', {
      name: 'Deine Einstellungen für das Zitat des Tages öffnen',
    });
    await user.click(settings);

    expect(
      await screen.findByText('Nur für dich – Ben sieht deine Auswahl nicht.'),
    ).toBeInTheDocument();

    const mindfulness = screen.getByRole('checkbox', {
      name: /Achtsamkeit/u,
    });
    await user.click(mindfulness);
    await user.click(screen.getByRole('button', { name: 'Fertig' }));

    await waitFor(() =>
      expect(api.updateDailyQuotePreferencesRaw).toHaveBeenCalledTimes(1),
    );
    expect(api.updateDailyQuotePreferencesRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: SPACE_ID,
        ifMatch: '"quote-pref:2"',
        dailyQuotePreferencePatch: expect.objectContaining({
          enabled: true,
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
