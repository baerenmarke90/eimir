// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateIdea } from '../api/generated/models/DateIdea';
import type { DateIdeaCatalog } from '../api/generated/models/DateIdeaCatalog';
import { dateIdeasQueryKey, rememberDateIdeaWish } from '../client/dateIdeas';
import { ClientProblemError } from '../client/problemDetails';
import { TaskOriginProvider } from '../client/taskOrigin';
import dateIdeas from '../i18n/locales/dateIdeas';
import { DateIdeasPage } from './DateIdeasPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const env = vi.hoisted(() => ({
  allowed: true as boolean,
  listDateIdeas: vi.fn(),
  getDateIdeaImage: vi.fn(),
}));

vi.mock('../client/dateIdeas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client/dateIdeas')>();
  return {
    ...actual,
    createDateIdeasApi: () => ({
      listDateIdeas: env.listDateIdeas,
      getDateIdeaImage: env.getDateIdeaImage,
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
    category: 'food_drink',
    placeType: 'home',
    minutes: 30,
    budgetEurForTwo: 0,
    title: `Title ${id}`,
    description: `Description ${id}`,
    wishTitle: `Wish ${id}`,
    planTitle: `Plan ${id}`,
    prerequisites: [],
    contentLocale: 'de',
    image: {
      id: `category-${'food_drink'}`,
      width: 1200,
      height: 800,
      alt: `Alt ${id}`,
    },
    ...overrides,
  };
}

function catalog(ideas: DateIdea[]): DateIdeaCatalog {
  return {
    catalogVersion: '1.0.0',
    locale: 'de',
    currency: 'EUR',
    totalCount: ideas.length,
    categories: [
      { id: 'food_drink', label: 'Food' },
      { id: 'nature', label: 'Nature' },
    ],
    placeTypes: [
      { id: 'home', label: 'Home' },
      { id: 'out', label: 'Out' },
    ],
    ideas,
  };
}

function renderPage(client = new QueryClient()) {
  client.setDefaultOptions({ queries: { retry: false } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/plan/ideas']}>
        <TaskOriginProvider accountId="account-1" spaceId="space-1">
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
            <Route path="/plan/wishes/new" element={<p>Wish composer</p>} />
            <Route path="/plan/wishes/:wishId" element={<p>Wish detail</p>} />
            <Route path="/plan/plans/new" element={<p>Plan composer</p>} />
          </Routes>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  env.allowed = true;
  env.listDateIdeas.mockReset();
  env.getDateIdeaImage.mockReset();
  env.getDateIdeaImage.mockResolvedValue(
    new Blob(['webp'], { type: 'image/webp' }),
  );
  URL.createObjectURL = vi.fn(() => 'blob:date-idea');
  URL.revokeObjectURL = vi.fn();
});

describe('DateIdeasPage', () => {
  it('shows a calm Pro hint to Free Spaces without reading the catalog', () => {
    env.allowed = false;
    renderPage();
    expect(
      screen.getByRole('heading', { name: new RegExp(dateIdeas.locked.title) }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: dateIdeas.locked.action })
        .getAttribute('href'),
    ).toBe('/more/pro?context=dateIdeas');
    expect(env.listDateIdeas).not.toHaveBeenCalled();
    expect(env.getDateIdeaImage).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows each idea image from the protected API with its alt text', async () => {
    env.listDateIdeas.mockResolvedValue(
      catalog([
        idea('eimir-date-001', {
          image: {
            id: 'eimir-date-001',
            width: 1200,
            height: 800,
            alt: 'Snacks on a blanket',
          },
        }),
        idea('eimir-date-004'),
      ]),
    );
    renderPage();
    const image = await screen.findByRole('img', {
      name: 'Snacks on a blanket',
    });
    expect(image.getAttribute('src')).toBe('blob:date-idea');
    expect(env.getDateIdeaImage).toHaveBeenCalledWith(
      { spaceId: 'space-1', imageId: 'eimir-date-001' },
      expect.anything(),
    );
    expect(env.getDateIdeaImage).toHaveBeenCalledWith(
      { spaceId: 'space-1', imageId: 'category-food_drink' },
      expect.anything(),
    );
  });

  it('drops cached protected catalog data once the capability is gone', () => {
    env.allowed = false;
    const client = new QueryClient();
    client.setQueryData(
      dateIdeasQueryKey('account-1', 'space-1', 'de'),
      catalog([idea('eimir-date-001')]),
    );
    renderPage(client);
    expect(
      client.getQueryData(dateIdeasQueryKey('account-1', 'space-1', 'de')),
    ).toBeUndefined();
    expect(screen.queryByText('Title eimir-date-001')).toBeNull();
  });

  it('filters locally with inclusive bounds and offers a reset', async () => {
    env.listDateIdeas.mockResolvedValue(
      catalog([
        idea('eimir-date-001'),
        idea('eimir-date-002', {
          category: 'nature',
          placeType: 'out',
          minutes: 45,
          budgetEurForTwo: 10,
        }),
      ]),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Title eimir-date-001' });
    expect(env.listDateIdeas.mock.calls[0][0]).toEqual({
      spaceId: 'space-1',
      locale: 'de',
    });

    // All filters live in one sheet behind one action (#1907 J1).
    expect(
      screen.queryByRole('group', { name: dateIdeas.filters.budgetLegend }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: dateIdeas.filters.open }),
    );
    const sheet = await screen.findByRole('dialog');
    const budget = within(sheet).getByRole('group', {
      name: dateIdeas.filters.budgetLegend,
    });
    fireEvent.click(within(budget).getByRole('button', { name: /10\s€/ }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    fireEvent.click(
      within(budget).getByRole('button', { name: dateIdeas.filters.free }),
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
    const place = within(sheet).getByRole('group', {
      name: dateIdeas.filters.placeLegend,
    });
    fireEvent.click(within(place).getByRole('button', { name: 'Out' }));
    expect(screen.getByText(dateIdeas.empty.title)).toBeTruthy();
    fireEvent.click(
      within(sheet).getByRole('button', {
        name: dateIdeas.filters.show_other.replace('{{count}}', '0'),
      }),
    );
    // Active filters stay visible as removable chips.
    const removePlace = screen.getByRole('button', {
      name: dateIdeas.filters.remove.replace('{{label}}', 'Out'),
    });
    expect(
      screen.getByRole('button', {
        name: dateIdeas.filters.openActive_other.replace('{{count}}', '2'),
      }),
    ).toBeTruthy();
    fireEvent.click(removePlace);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: dateIdeas.filters.remove.replace(
          '{{label}}',
          dateIdeas.filters.free,
        ),
      }),
    );
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: dateIdeas.filters.open }),
    ).toBeTruthy();
    expect(env.listDateIdeas).toHaveBeenCalledTimes(1);
  });

  it('opens the existing composers instead of saving directly', async () => {
    env.listDateIdeas.mockResolvedValue(catalog([idea('eimir-date-001')]));
    renderPage();
    const save = await screen.findByRole('link', { name: dateIdeas.card.save });
    expect(save.getAttribute('href')).toBe('/plan/wishes/new');
    const plan = screen.getByRole('link', { name: dateIdeas.card.plan });
    expect(plan.getAttribute('href')).toBe('/plan/plans/new');
    fireEvent.click(save);
    expect(await screen.findByText('Wish composer')).toBeTruthy();
  });

  it('plans an idea already saved as a Wish through that Wish', async () => {
    env.listDateIdeas.mockResolvedValue(catalog([idea('eimir-date-001')]));
    const client = new QueryClient();
    rememberDateIdeaWish(
      client,
      'account-1',
      'space-1',
      'eimir-date-001',
      'wish-9',
    );
    renderPage(client);
    const saved = await screen.findByRole('link', {
      name: dateIdeas.card.saved,
    });
    expect(saved.getAttribute('href')).toBe('/plan/wishes/wish-9');
    expect(
      screen
        .getByRole('link', { name: dateIdeas.card.plan })
        .getAttribute('href'),
    ).toBe('/plan/wishes/wish-9');
  });

  it('shows the Pro hint when the server denies the catalog', async () => {
    env.listDateIdeas.mockRejectedValue(
      new ClientProblemError('permission', 403, 'PREMIUM_ENTITLEMENT_REQUIRED'),
    );
    renderPage();
    expect(
      await screen.findByRole('heading', {
        name: new RegExp(dateIdeas.locked.title),
      }),
    ).toBeTruthy();
  });
});
