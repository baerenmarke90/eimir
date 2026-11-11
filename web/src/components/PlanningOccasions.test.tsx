// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
  expect(
    await screen.findByRole('button', { name: /Geburtstag von Alex/ }),
  ).toBeTruthy();
  expect(
    await screen.findByRole('button', { name: /Geburtstag von Sam/ }),
  ).toBeTruthy();
  const anniversary = await screen.findByRole('button', {
    name: new RegExp(i18n.t('importantDates.relationshipAnniversary')),
  });
  expect(
    anniversary.querySelector('svg.eimir-icon-wir.eimir-icon-filled'),
  ).not.toBeNull();
  expect(profiles).toHaveBeenCalledWith({ spaceId: 'space', accountId: 'own' });
  expect(screen.queryByText(i18n.t('importantDates.emptyTitle'))).toBeNull();
});
