// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateIdea } from '../api/generated/models/DateIdea';
import type { DateIdeaCatalog } from '../api/generated/models/DateIdeaCatalog';
import { ClientProblemError } from '../client/problemDetails';
import dateIdeas from '../i18n/locales/dateIdeas';
import { DateIdeasPage } from './DateIdeasPage';

const env = vi.hoisted(() => ({
  allowed: true as boolean,
  listDateIdeas: vi.fn(),
  saveDateIdeaAsWish: vi.fn(),
}));

vi.mock('../client/dateIdeas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client/dateIdeas')>();
  return {
    ...actual,
    createDateIdeasApi: () => ({
      listDateIdeas: env.listDateIdeas,
      saveDateIdeaAsWish: env.saveDateIdeaAsWish,
    }),
    useDateInspirationCapability: () => ({
      data: env.allowed,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
  };
});

function idea(id: string, overrides: Partial<DateIdea> = {}): DateIdea {
  return {
    id,
    title: `Titel ${id}`,
    description: `Beschreibung ${id}`,
    requirements: [],
    categoryId: 'cozy',
    contentLocale: 'de',
    durationMinMinutes: 60,
    durationMaxMinutes: 120,
    durationBand: 'EVENING',
    budgetMin: 10,
    budgetMax: 30,
    budgetBand: 'LOW',
    setting: 'HOME',
    ...overrides,
  };
}

function catalog(ideas: DateIdea[]): DateIdeaCatalog {
  return {
    catalogVersion: 'test',
    edition: 'editorial',
    locale: 'de',
    currency: 'EUR',
    totalCount: ideas.length,
    categories: [
      { id: 'cozy', label: 'Gemütlich' },
      { id: 'outdoors', label: 'Draußen' },
    ],
    ideas,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/plan/ideas']}>
        <Routes>
          <Route
            path="/plan/ideas"
            element={
              <DateIdeasPage
                accountId="account-1"
                spaceId="space-1"
                apiBaseUrl="https://eimir.test"
                accessToken="token"
              />
            }
          />
          <Route path="/plan/wishes/:wishId" element={<p>Wish result</p>} />
          <Route path="/plan/plans/new" element={<p>Plan composer</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  env.allowed = true;
  env.listDateIdeas.mockReset();
  env.saveDateIdeaAsWish.mockReset();
});

describe('DateIdeasPage', () => {
  it('shows a calm Pro explanation to Free Spaces without reading the catalog', () => {
    env.allowed = false;
    renderPage();
    expect(
      screen.getByRole('heading', { name: new RegExp(dateIdeas.locked.title) }),
    ).toBeTruthy();
    expect(screen.getByText(dateIdeas.locked.retained)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: dateIdeas.locked.action }),
    ).toBeTruthy();
    expect(env.listDateIdeas).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('filters instantly on the client and offers a reset for no match', async () => {
    env.listDateIdeas.mockResolvedValue(
      catalog([
        idea('picnic'),
        idea('hike', {
          categoryId: 'outdoors',
          setting: 'OUT',
          durationBand: 'LONG',
        }),
        idea('cinema', { setting: 'EITHER' }),
      ]),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Titel picnic' });
    expect(env.listDateIdeas).toHaveBeenCalledTimes(1);
    expect(env.listDateIdeas.mock.calls[0][0]).toEqual({
      spaceId: 'space-1',
      locale: 'de',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Draußen' }));
    expect(screen.getByRole('heading', { name: 'Titel hike' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Titel picnic' })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: dateIdeas.filters.more }),
    );
    const settings = screen.getByRole('group', {
      name: dateIdeas.filters.settingLegend,
    });
    fireEvent.click(
      within(settings).getByRole('button', {
        name: dateIdeas.filters.setting.HOME,
      }),
    );
    expect(screen.getByText(dateIdeas.empty.title)).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole('button', { name: dateIdeas.filters.reset })[0],
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    // Filtering never asks the server again.
    expect(env.listDateIdeas).toHaveBeenCalledTimes(1);
  });

  it('saves an idea once and turns the action into a link to the actual Wish', async () => {
    env.listDateIdeas.mockResolvedValue(catalog([idea('picnic')]));
    let resolve: (value: unknown) => void = () => undefined;
    env.saveDateIdeaAsWish.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderPage();
    const save = await screen.findByRole('button', {
      name: dateIdeas.card.save,
    });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(env.saveDateIdeaAsWish).toHaveBeenCalled());
    expect(env.saveDateIdeaAsWish).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: dateIdeas.card.saving }),
    ).toHaveProperty('disabled', true);
    const request = env.saveDateIdeaAsWish.mock.calls[0][0];
    expect(request.ideaId).toBe('picnic');
    expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    resolve({ id: 'wish-1', title: 'Titel picnic', version: 1 });
    const saved = await screen.findByRole('link', {
      name: dateIdeas.card.saved,
    });
    expect(saved.getAttribute('href')).toBe('/plan/wishes/wish-1');
    expect(
      screen.getByText(
        dateIdeas.card.savedStatus.replace('{{title}}', 'Titel picnic'),
      ),
    ).toBeTruthy();
    // A saved idea is planned through its Wish (canonical conversion).
    expect(
      screen
        .getByRole('link', { name: dateIdeas.card.plan })
        .getAttribute('href'),
    ).toBe('/plan/wishes/wish-1');
  });

  it('keeps the idea unsaved and explains failures, offering the same retry', async () => {
    env.listDateIdeas.mockResolvedValue(catalog([idea('picnic')]));
    env.saveDateIdeaAsWish
      .mockRejectedValueOnce(new ClientProblemError('server', 503))
      .mockResolvedValueOnce({ id: 'wish-1', version: 1 });
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: dateIdeas.card.save }),
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: dateIdeas.card.save }));
    await screen.findByRole('link', { name: dateIdeas.card.saved });
    const [first, second] = env.saveDateIdeaAsWish.mock.calls.map(
      ([call]) => call.idempotencyKey,
    );
    // An unknown outcome (server error) reuses the same request identity.
    expect(second).toBe(first);
  });

  it('switches to the Pro explanation when the server denies the catalog', async () => {
    env.listDateIdeas.mockRejectedValue(
      new ClientProblemError('permission', 403, 'PREMIUM_ENTITLEMENT_REQUIRED'),
    );
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: new RegExp(dateIdeas.locked.title),
        }),
      ).toBeTruthy(),
    );
  });

  it('links Jetzt planen to the composer for an unsaved idea', async () => {
    env.listDateIdeas.mockResolvedValue(catalog([idea('picnic')]));
    renderPage();
    const plan = await screen.findByRole('link', {
      name: dateIdeas.card.plan,
    });
    expect(plan.getAttribute('href')).toBe('/plan/plans/new');
    fireEvent.click(plan);
    expect(await screen.findByText('Plan composer')).toBeTruthy();
  });
});
