// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BillingChannel,
  currentBillingChannel,
  type ProPurchaseOutcome,
  REFERENCE_PRO_PLANS,
  unlocksFeature,
  yearlySavingPercent,
} from '../client/proBilling';
import { MemoryWorldId } from '../api/generated/models/MemoryWorldId';
import memoryWorldSettings from '../i18n/locales/memoryWorldSettings';
import proPaywall from '../i18n/locales/proPaywall';
import { PRO_MEMORY_WORLD_IDS } from './ProFeatureCatalogue';
import { ProPaywallPage } from './ProPaywallPage';

const session = vi.hoisted(() => ({
  data: undefined as { tier: string } | undefined,
  error: null as Error | null,
  refetch: vi.fn(),
}));

vi.mock('../client/proPresentation', () => ({
  useSessionSpaceEntitlement: () => ({
    query: {
      data: session.data,
      error: session.error,
      isPending: !session.data && !session.error,
      refetch: session.refetch,
    },
    hasOwner: true,
    accountId: 'account-1',
    spaceId: 'space-1',
  }),
  useHideProFeatureMarks: () => false,
}));

function renderPaywall(path: string, billingChannel?: BillingChannel) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/more/pro"
            element={<ProPaywallPage billingChannel={billingChannel} />}
          />
          <Route path="/plan" element={<p>Planning home</p>} />
          <Route path="/more" element={<p>More home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

function channel(result: ProPurchaseOutcome) {
  const purchase = vi.fn().mockResolvedValue(result);
  const restore = vi.fn().mockResolvedValue('restored');
  return {
    purchase,
    restore,
    channel: {
      kind: 'available',
      offers: REFERENCE_PRO_PLANS,
      purchase,
      restore,
    } satisfies BillingChannel,
  };
}

beforeEach(() => {
  session.data = { tier: 'FREE' };
  session.error = null;
  session.refetch.mockReset();
});

describe('billing contract', () => {
  it('uses the Product Owner target prices and saves about 37 %', () => {
    expect(REFERENCE_PRO_PLANS.map((plan) => plan.amount)).toEqual([
      59.99, 7.99,
    ]);
    expect(yearlySavingPercent(REFERENCE_PRO_PLANS)).toBe(37);
  });

  it('has no purchase channel in the browser (in-app purchases only)', () => {
    expect(currentBillingChannel()).toEqual({
      kind: 'unavailable',
      platform: 'web',
    });
    expect(unlocksFeature('confirmed')).toBe(true);
    expect(unlocksFeature('partnerActive')).toBe(true);
    expect(unlocksFeature('pending')).toBe(false);
    expect(unlocksFeature('cancelled')).toBe(false);
  });
});

describe('ProPaywallPage', () => {
  it.each([
    ['dateIdeas', proPaywall.contexts.dateIdeas],
    ['recaps', proPaywall.contexts.recaps],
    ['memoryMap', proPaywall.contexts.memoryMap],
    ['photoSources', proPaywall.contexts.photoSources],
    ['storage', proPaywall.contexts.storage],
    ['calendar', proPaywall.contexts.calendar],
    ['games', proPaywall.contexts.games],
  ])('presents the %s context with its benefits', (context, copy) => {
    renderPaywall(`/more/pro?context=${context}`);
    expect(
      screen.getByRole('heading', { level: 1, name: copy.title }),
    ).toBeTruthy();
    for (const benefit of Object.values(copy.benefits))
      expect(screen.getByText(benefit.title)).toBeTruthy();
    expect(
      screen.getByRole('list', { name: proPaywall.benefitsLabel }).children,
    ).toHaveLength(Object.keys(copy.benefits).length);
  });

  it('gives the storage context two benefits, none about imports', () => {
    expect(Object.keys(proPaywall.contexts.storage.benefits)).toEqual([
      'first',
      'second',
    ]);
  });

  it('uses the full catalogue for an unknown context', () => {
    renderPaywall('/more/pro?context=unknown');
    const catalogue = screen.getByRole('region', {
      name: proPaywall.catalogue.title,
    });
    for (const group of Object.values(proPaywall.catalogue.groups)) {
      expect(catalogue.textContent).toContain(group);
    }
    for (const { title, body } of Object.values(
      proPaywall.catalogue.features,
    )) {
      expect(catalogue.textContent).toContain(title);
      // Interpolated bodies are checked up to their first placeholder.
      expect(catalogue.textContent).toContain(body.split('{{')[0]);
    }
    expect(
      screen.queryByRole('list', { name: proPaywall.benefitsLabel }),
    ).toBeNull();
  });

  it('lists the ten Pro memory worlds by their settings names', () => {
    const free: readonly string[] = ['story', 'stack'];
    expect([...PRO_MEMORY_WORLD_IDS].sort()).toEqual(
      Object.values(MemoryWorldId)
        .filter((id) => !free.includes(id))
        .sort(),
    );
    renderPaywall('/more/pro');
    const catalogue = screen.getByRole('region', {
      name: proPaywall.catalogue.title,
    });
    for (const id of PRO_MEMORY_WORLD_IDS)
      expect(catalogue.textContent).toContain(
        memoryWorldSettings.worlds[id].name,
      );
    expect(catalogue.textContent).not.toContain('{{');
  });

  it('offers the Cloud storage allowance in the catalogue', () => {
    renderPaywall('/more/pro');
    const storage = proPaywall.catalogue.features.storage;
    expect(storage.title).toContain('50 GB');
    expect(storage.title).toContain('eimir. Cloud');
    expect(screen.getByText(storage.title)).toBeTruthy();
    expect(screen.getByText(storage.body)).toBeTruthy();
  });

  it('marks the newest Pro capabilities as new', () => {
    renderPaywall('/more/pro');
    const marked = screen
      .getAllByText(proPaywall.catalogue.new)
      .map((mark) => mark.closest('dt')?.firstChild?.textContent);
    expect(marked.sort()).toEqual(
      [
        proPaywall.catalogue.features.games.title,
        proPaywall.catalogue.features.memoryWorlds.title,
        proPaywall.catalogue.features.recaps.title,
        proPaywall.catalogue.features.storage.title,
      ].sort(),
    );
  });

  it('preselects the yearly plan and lets the monthly plan be chosen', () => {
    renderPaywall('/more/pro?context=dateIdeas');
    const yearly = screen.getByRole('radio', { name: /Jährlich/ });
    const monthly = screen.getByRole('radio', { name: /Monatlich/ });
    expect((yearly as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/59,99\s€ pro Jahr/)).toBeTruthy();
    expect(screen.getByText(/7,99\s€ pro Monat/)).toBeTruthy();
    expect(screen.getByText('Spart rund 37 %')).toBeTruthy();
    fireEvent.click(monthly);
    expect((monthly as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(proPaywall.forBoth)).toBeTruthy();
  });

  it('shows no purchase action without a billing provider', () => {
    renderPaywall('/more/pro');
    expect(screen.getByText(proPaywall.unavailableTitle)).toBeTruthy();
    expect(screen.getByText(proPaywall.webUnavailableBody)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /abonnieren/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: proPaywall.restore }),
    ).toBeNull();
    for (const term of Object.values(proPaywall.terms))
      expect(screen.getByText(term.title)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: proPaywall.terms.privacy.link })
        .getAttribute('href'),
    ).toBe('/legal/privacy');
  });

  it('confirms an existing Pro grant instead of offering plans', () => {
    session.data = { tier: 'PREMIUM' };
    renderPaywall('/more/pro?context=dateIdeas');
    expect(screen.getByText(proPaywall.active.title)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: proPaywall.active.continue }),
    );
    expect(screen.getByText('Planning home')).toBeTruthy();
  });

  it('keeps an unknown entitlement status neutral and retryable', () => {
    session.data = undefined;
    session.error = new Error('offline');
    renderPaywall('/more/pro');
    expect(screen.getByText(proPaywall.statusUnknown)).toBeTruthy();
    expect(screen.queryByText(proPaywall.active.title)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: proPaywall.statusRetry }),
    );
    expect(session.refetch).toHaveBeenCalled();
  });

  it('stays on the paywall after a cancelled purchase', async () => {
    const test = channel('cancelled');
    renderPaywall('/more/pro?context=dateIdeas', test.channel);
    fireEvent.click(screen.getByRole('radio', { name: /Monatlich/ }));
    fireEvent.click(
      screen.getByRole('button', { name: proPaywall.purchase.monthly }),
    );
    expect(test.purchase).toHaveBeenCalledWith('monthly');
    expect(await screen.findByText(proPaywall.outcomes.cancelled)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows no purchase action while the store offers are loading', () => {
    renderPaywall('/more/pro', { kind: 'loading' });
    expect(screen.getByText(proPaywall.loadingOffers)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /abonnieren/ })).toBeNull();
  });

  it('explains an unreachable store without offering a purchase', () => {
    renderPaywall('/more/pro', {
      kind: 'unavailable',
      platform: 'native',
      reason: 'store',
    });
    expect(screen.getByText(proPaywall.storeUnavailableTitle)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /abonnieren/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: proPaywall.statusRetry }),
    ).toBeTruthy();
  });

  it('presents live store offers with an eligible trial', () => {
    const test = channel('confirmed');
    renderPaywall('/more/pro', {
      ...test.channel,
      offers: [
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
      ],
    });
    expect(screen.getByText(/62,99\s€ pro Jahr/)).toBeTruthy();
    expect(screen.getByText(/8,49\s€ pro Monat/)).toBeTruthy();
    expect(screen.getByText('14 Tage kostenlos testen')).toBeTruthy();
    expect(screen.getByText(proPaywall.storeNote)).toBeTruthy();
  });

  it('reports a restore without purchases as an alert and stays', async () => {
    const test = channel('confirmed');
    test.restore.mockResolvedValue('nothingToRestore');
    renderPaywall('/more/pro?context=dateIdeas', test.channel);
    fireEvent.click(screen.getByRole('button', { name: proPaywall.restore }));
    expect(
      await screen.findByText(proPaywall.outcomes.nothingToRestore),
    ).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('offers store subscription management to an active Space', () => {
    session.data = { tier: 'PREMIUM' };
    const test = channel('confirmed');
    const manage = vi.fn().mockResolvedValue(undefined);
    renderPaywall('/more/pro', { ...test.channel, manage });
    fireEvent.click(screen.getByRole('button', { name: proPaywall.manage }));
    expect(manage).toHaveBeenCalled();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('returns to the requested feature after a confirmed unlock', async () => {
    const test = channel('confirmed');
    renderPaywall('/more/pro?context=dateIdeas', test.channel);
    fireEvent.click(
      screen.getByRole('button', { name: proPaywall.purchase.yearly }),
    );
    expect(test.purchase).toHaveBeenCalledWith('yearly');
    await waitFor(() => expect(screen.getByText('Planning home')).toBeTruthy());
  });
});

describe('Pro showcase', () => {
  const scenes = proPaywall.showcase.scenes;

  function showcase() {
    return screen.getByRole('region', { name: proPaywall.showcase.label });
  }

  it('shows four highlights on the general page in order', () => {
    renderPaywall('/more/pro');
    const region = showcase();
    const items = within(region).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(
      items.map((item) => within(item).getByRole('heading').textContent),
    ).toEqual([
      scenes.memoryWorlds.title,
      scenes.recapFilms.title,
      scenes.gamesGarden.title,
      scenes.mapCloseness.title,
    ]);
    expect(within(region).getByText(scenes.recapFilms.body)).toBeTruthy();
    expect(
      [...region.querySelectorAll('[data-scene]')].map(
        (node) => (node as HTMLElement).dataset.scene,
      ),
    ).toEqual(['memoryWorlds', 'recapFilms', 'gamesGarden', 'mapCloseness']);
    for (const node of region.querySelectorAll('[data-scene]'))
      expect(node.getAttribute('aria-hidden')).toBe('true');
    // The gallery replaces the brand hero on the general page.
    expect(document.querySelector('.pro-paywall-hero')).toBeNull();
  });

  it('marks the first highlight current and never advances on its own', () => {
    vi.useFakeTimers();
    try {
      renderPaywall('/more/pro');
      const indicators = within(showcase()).getAllByRole('button');
      expect(indicators.map((button) => button.getAttribute('aria-label')))
        .toEqual([
          'Highlight 1 von 4',
          'Highlight 2 von 4',
          'Highlight 3 von 4',
          'Highlight 4 von 4',
        ]);
      expect(indicators[0].getAttribute('aria-current')).toBe('true');
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(indicators[0].getAttribute('aria-current')).toBe('true');
      expect(indicators[1].hasAttribute('aria-current')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves to a highlight from its indicator', () => {
    renderPaywall('/more/pro');
    const indicators = within(showcase()).getAllByRole('button');
    fireEvent.click(indicators[2]);
    expect(indicators[2].getAttribute('aria-current')).toBe('true');
    expect(indicators[0].hasAttribute('aria-current')).toBe(false);
  });

  it('names the yearly price per month for both partners', () => {
    renderPaywall('/more/pro');
    expect(showcase().textContent).toMatch(
      /Alles zusammen für 5,00\s€ im Monat, für euch beide\./,
    );
  });

  it('shows the matching scene as hero on context pages', () => {
    renderPaywall('/more/pro?context=memoryMap');
    expect(
      screen.queryByRole('region', { name: proPaywall.showcase.label }),
    ).toBeNull();
    const hero = document.querySelector('[data-scene]') as HTMLElement;
    expect(hero.dataset.scene).toBe('mapCloseness');
    expect(document.querySelector('.pro-paywall-hero')).toBeNull();
  });

  it.each([
    ['recaps', 'recapFilms'],
    ['games', 'gamesGarden'],
  ])('shows the %s scene as hero', (context, scene) => {
    renderPaywall(`/more/pro?context=${context}`);
    expect(
      (document.querySelector('[data-scene]') as HTMLElement).dataset.scene,
    ).toBe(scene);
  });

  it('keeps the brand hero where no scene fits', () => {
    renderPaywall('/more/pro?context=dateIdeas');
    expect(document.querySelector('[data-scene]')).toBeNull();
    expect(document.querySelector('.pro-paywall-hero')).toBeTruthy();
  });

  it('keeps the gallery for an active Space without plans or price', () => {
    session.data = { tier: 'PREMIUM' };
    renderPaywall('/more/pro');
    expect(within(showcase()).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(showcase().textContent).not.toContain('im Monat');
  });

  it('falls back to the general gallery for an unknown context', () => {
    renderPaywall('/more/pro?context=nope');
    expect(within(showcase()).getAllByRole('listitem')).toHaveLength(4);
  });

  it('makes no request of its own', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      renderPaywall('/more/pro');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
