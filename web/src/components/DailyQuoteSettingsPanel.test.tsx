import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DailyQuoteApi } from '../api/generated/apis/DailyQuoteApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DailyQuotePreferenceView } from '../api/generated/models/DailyQuotePreferenceView';
import dailyQuote from '../i18n/locales/dailyQuote';
import { DailyQuoteSettingsPanel } from './DailyQuoteSettingsPanel';

const ACCOUNT_ID = 'account-1';
const SPACE_ID = 'space-1';

const preference: DailyQuotePreferenceView = {
  accountId: ACCOUNT_ID,
  enabled: true,
  locale: null,
  selectedCategoryIds: ['love'],
  selectedSourceIds: ['classic_literature'],
  version: 2,
};

function rawResponse<T>(value: T, etag = '"quote-pref:2"') {
  return {
    raw: new Response(JSON.stringify(value), {
      status: 200,
      headers: { ETag: etag, 'Content-Type': 'application/json' },
    }),
    value: async () => value,
  };
}

function renderPanel(capabilities = ['daily.quote']) {
  const getEntitlements = vi.fn().mockResolvedValue({
    spaceId: SPACE_ID,
    status: capabilities.length > 0 ? 'ACTIVE' : 'FREE',
    tier: capabilities.length > 0 ? 'PREMIUM' : 'FREE',
    capabilities,
    isInGracePeriod: false,
  });
  const getPreferences = vi.fn().mockResolvedValue(rawResponse(preference));
  const updatePreferences = vi
    .fn()
    .mockImplementation(
      async ({
        dailyQuotePreferencePatch,
      }: {
        dailyQuotePreferencePatch: { enabled?: boolean | null };
      }) =>
        rawResponse(
          {
            ...preference,
            enabled: dailyQuotePreferencePatch.enabled ?? preference.enabled,
            version: 3,
          },
          '"quote-pref:3"',
        ),
    );

  const quoteApi = {
    getDailyQuotePreferencesRaw: getPreferences,
    updateDailyQuotePreferencesRaw: updatePreferences,
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
        <DailyQuoteSettingsPanel
          quoteApi={quoteApi}
          entitlementsApi={entitlementsApi}
          accountId={ACCOUNT_ID}
          spaceId={SPACE_ID}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { getEntitlements, getPreferences, updatePreferences };
}

afterEach(() => {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

describe('DailyQuoteSettingsPanel', () => {
  it('toggles only personal visibility and preserves the stored selections', async () => {
    const user = userEvent.setup();
    const api = renderPanel();

    const toggle = await screen.findByRole('switch', {
      name: dailyQuote.enabledLabel,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    await user.click(toggle);

    await waitFor(() => expect(api.updatePreferences).toHaveBeenCalledTimes(1));
    expect(api.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: SPACE_ID,
        ifMatch: '"quote-pref:2"',
        dailyQuotePreferencePatch: { enabled: false },
      }),
      undefined,
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('switch', { name: dailyQuote.enabledLabel })
          .getAttribute('aria-checked'),
      ).toBe('false'),
    );
  });

  it('keeps Free settings quiet and does not request personal preferences', async () => {
    const api = renderPanel([]);

    expect(await screen.findByText(dailyQuote.discoveryMeta)).toBeTruthy();
    expect(
      screen.queryByRole('switch', { name: dailyQuote.enabledLabel }),
    ).toBeNull();
    expect(api.getPreferences).not.toHaveBeenCalled();
  });

  it('does not attempt a settings write while offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const user = userEvent.setup();
    const api = renderPanel();

    const toggle = await screen.findByRole('switch', {
      name: dailyQuote.enabledLabel,
    });
    await user.click(toggle);

    expect(await screen.findByText(dailyQuote.preferencesOffline)).toBeTruthy();
    expect(api.updatePreferences).not.toHaveBeenCalled();
  });
});
