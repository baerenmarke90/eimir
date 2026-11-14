// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { i18n } from '../i18n';
import { PlanningOccasions } from './PlanningOccasions';

afterEach(() => vi.unstubAllGlobals());

it('uses both authoritative account profiles and the shared start date for occasions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'space',
            createdAt: '2026-01-01',
            partners: [
              { id: 'own', displayName: 'Alex' },
              { id: 'partner', displayName: 'Sam' },
            ],
            relationshipStartedOn: '2020-02-29',
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
  const profiles = vi.fn(async ({ accountId }: { accountId: string }) => ({
    displayName: accountId === 'own' ? 'Alex' : 'Sam',
    birthday: new Date(
      accountId === 'own' ? '1991-05-10T00:00:00Z' : '1992-06-11T00:00:00Z',
    ),
  }));
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <PlanningOccasions
          spaceId="space"
          accountId="own"
          apiBaseUrl="https://api.example"
          accessToken="fixture"
          profilesApi={
            {
              getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet: profiles,
            } as unknown as ProfilesApi
          }
          peopleApi={
            {
              listRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGet: vi
                .fn()
                .mockResolvedValue([]),
              listImportantDatesApiV1SpacesSpaceIdImportantDatesGet: vi
                .fn()
                .mockResolvedValue([]),
            } as unknown as PeopleApi
          }
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Only the chosen month is listed, so each occasion is looked up on the
  // sheet of the month that holds it.
  await waitFor(() =>
    expect(document.querySelectorAll('.occasions-band-month').length).toBe(12),
  );
  const find = (label: RegExp) => {
    for (const month of document.querySelectorAll<HTMLElement>(
      '.occasions-band-month',
    )) {
      fireEvent.click(month);
      const match = [
        ...document.querySelectorAll<HTMLElement>(
          '.occasions-sheet .important-date-card',
        ),
      ].find((card) => label.test(card.textContent ?? ''));
      if (match) return match;
    }
    throw new Error(`No occasion row for ${label}`);
  };
  // The partner's profile arrives separately, so each lookup waits for it.
  const row = (label: RegExp) => waitFor(() => find(label));
  expect(await row(/Geburtstag von Alex/)).toBeTruthy();
  expect(await row(/Geburtstag von Sam/)).toBeTruthy();
  const anniversary = await row(
    new RegExp(i18n.t('importantDates.relationshipAnniversary')),
  );
  expect(
    anniversary.querySelector('svg.eimir-icon-wir.eimir-icon-outline'),
  ).not.toBeNull();
  expect(profiles).toHaveBeenCalledWith({ spaceId: 'space', accountId: 'own' });
  expect(screen.queryByText(i18n.t('importantDates.emptyTitle'))).toBeNull();
});
