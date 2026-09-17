import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DurationDisplayMode } from '../api/generated/models/DurationDisplayMode';
import type { M4ProductApis } from '../client/m4Product';
import {
  DASHBOARD_MODULE_KEYS,
  type DashboardModuleKey,
} from '../client/dashboardModules';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import { i18n } from '../i18n';
import de from '../i18n/locales/de';
import m5s5 from '../i18n/locales/m5s5';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import { formatRelationshipDuration, TodayPage } from './TodayPage';

/**
 * By default this seeds an already-resolved (empty-override) Dashboard
 * preferences response, so every existing content assertion keeps seeing the
 * product-default composition it always has. Pass `preferencesPending: true`
 * to instead leave the preferences query genuinely unresolved (#817
 * regression coverage: Today must not flash hidden content while an
 * account-scoped preferences fetch is still in flight - see "never flashes a
 * persisted-hidden module" below).
 */
function renderTodayPage(
  dashboardData: unknown,
  itemLimit?: 1 | 2 | 3,
  options?: { preferences?: unknown; preferencesPending?: boolean },
): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], dashboardData);
  if (!options?.preferencesPending) {
    queryClient.setQueryData(
      dashboardPreferencesQueryKey('account-1', 'space-1'),
      options?.preferences ??
        (itemLimit !== undefined
          ? { items: [{ moduleKey: 'upcoming', itemLimit }] }
          : { items: [] }),
    );
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayPage
          apis={{} as M4ProductApis}
          spaceId="space-1"
          account={{ id: 'account-1', displayName: 'Alex' }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TodayPage', () => {
  it('renders couple presence hero, days together, thinking-of-you button, and the composed modules', () => {
    const html = renderTodayPage({
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 420 },
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Weekend trip to Paris',
          scheduledAt: new Date('2026-09-15T10:00:00Z'),
        },
      ],
      recentShared: [
        {
          id: 'mem-1',
          type: 'MEMORY',
          titleOrText: 'Park Picnic',
          occurredOn: new Date('2026-09-01T14:00:00Z'),
        },
        {
          id: 'chapter-1',
          type: 'CHAPTER',
          titleOrText: 'Our first chapter',
          createdAt: new Date('2026-08-30T14:00:00Z'),
        },
      ],
      retrospective: {
        id: 'heart-1',
        type: 'HEART_MOMENT',
        titleOrText: 'Morning Smile',
        createdAt: new Date('2025-09-03T08:00:00Z'),
      },
    });

    expect(html).toContain('Marie');
    expect(html).toContain('420');
    expect(html).toContain('today-hero-action');
    expect(html).toContain('Weekend trip to Paris');
    expect(html).toContain('Park Picnic');
    expect(html).toContain('Morning Smile');

    // The full R4 order when every eligible role is present, top to bottom.
    const order = [
      'today-hero',
      'today-section-upcoming',
      'today-section-moment',
      'today-section-living',
      'today-section-recent',
    ].map((section) => html.indexOf(section));
    expect(order).not.toContain(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // Content-type grammars stay distinct: the retired generic content card
    // (media well + kind badge row + title + date) is gone, replaced by an
    // image-led feature, a tinted contextual module and quiet trace tiles.
    expect(html).not.toContain('today-card-badges');
    expect(html).toContain('today-agenda-row');
    expect(html).toContain('today-living-retrospective');
    expect(html).toContain('today-recent-tile');
  });

  it('reflects the server-authoritative Thinking-of-you cooldown from the Dashboard on load (regression #790/#791)', () => {
    const html = renderTodayPage({
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: null,
      upcoming: [],
      recentShared: [],
      retrospective: null,
      thinkingOfYouAvailableAt: new Date(Date.now() + 29 * 60_000),
    });

    const expectedLabel = relationshipComponents.thinkingOfYouCooldown.replace(
      '{{minutes}}',
      '29',
    );
    expect(html).toContain('state-cooldown');
    expect(html).toContain(expectedLabel);
    expect(html).toContain('disabled=""');
  });

  it('does not show a cooldown when Dashboard.thinkingOfYouAvailableAt is null', () => {
    const html = renderTodayPage({
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: null,
      upcoming: [],
      recentShared: [],
      retrospective: null,
      thinkingOfYouAvailableAt: null,
    });

    expect(html).not.toContain('state-cooldown');
    expect(html).toContain('today-hero-action');
  });

  it('renders welcoming new-space experience when there are no items yet, without hiding the couple presence hero', () => {
    const html = renderTodayPage({
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: null,
      upcoming: [],
      recentShared: [],
      retrospective: null,
    });

    // Couple Presence remains the permanent H1 entry point, even for a sparse space
    expect(html).toContain('today-hero');
    expect(html).toContain('couple-presence-title');

    expect(html).toContain('new-space-experience');
    expect(html).not.toContain('new-space-mark');
    expect(html).toContain('Marie');
    expect(html).toContain('href="/story/memories/new"');
  });

  it('renders secondary upcoming items as calm agenda rows with title and date, not a card carousel', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
      relationshipDuration: null,
      upcoming: [
        {
          id: 'plan-primary',
          type: 'PLAN',
          titleOrText: 'Primary Plan',
          scheduledAt: new Date('2026-09-02T10:00:00Z'),
        },
        {
          id: 'plan-secondary',
          type: 'PLAN',
          titleOrText: 'Second Excursion',
          scheduledAt: new Date('2026-09-10T12:00:00Z'),
        },
      ],
      recentShared: [],
      retrospective: null,
    });
    queryClient.setQueryData(
      dashboardPreferencesQueryKey('account-1', 'space-1'),
      { items: [{ moduleKey: 'upcoming', itemLimit: 2 }] },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={{} as M4ProductApis}
            spaceId="space-1"
            account={{ id: 'account-1', displayName: 'Alex' }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('today-agenda-list');
    expect(html).toContain('today-agenda-row');
    expect(html).toContain('today-agenda-title');
    expect(html).toContain('today-agenda-date');
    expect(html).toContain('Second Excursion');

    // No card-carousel markup for the secondary agenda
    expect(html).not.toContain('today-stream-upcoming');
  });

  it.each([
    [undefined, ['Upcoming 1'], ['Upcoming 2', 'Upcoming 3', 'Upcoming 4']],
    [1, ['Upcoming 1'], ['Upcoming 2', 'Upcoming 3', 'Upcoming 4']],
    [2, ['Upcoming 1', 'Upcoming 2'], ['Upcoming 3', 'Upcoming 4']],
    [3, ['Upcoming 1', 'Upcoming 2', 'Upcoming 3'], ['Upcoming 4']],
  ] as const)(
    'renders the effective personal upcoming limit without changing order',
    (itemLimit, visible, hidden) => {
      const html = renderTodayPage(
        {
          space: {
            id: 'space-1',
            partner: { id: 'partner-1', displayName: 'Marie' },
          },
          relationshipDuration: null,
          upcoming: [1, 2, 3, 4].map((position) => ({
            id: `plan-${position}`,
            type: 'PLAN',
            titleOrText: `Upcoming ${position}`,
            scheduledAt: new Date(`2026-09-${position + 10}T10:00:00Z`),
          })),
          recentShared: [],
          retrospective: null,
        },
        itemLimit,
      );

      for (const title of visible) expect(html).toContain(title);
      for (const title of hidden) expect(html).not.toContain(title);
      for (const [index, title] of visible.entries()) {
        if (index === 0) continue;
        expect(html.indexOf(visible[index - 1])).toBeLessThan(
          html.indexOf(title),
        );
      }
    },
  );

  it('renders the server-provided Keepsake as the Heroic focal point when no retrospective exists, and filters it out of the Shared Trace below', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
      relationshipDuration: null,
      upcoming: [],
      keepsake: {
        id: 'mem-photo',
        type: 'MEMORY',
        titleOrText: 'Photo Memory',
        occurredOn: new Date('2026-09-01T12:00:00Z'),
        previewAttachmentId: 'att-123',
      },
      recentShared: [
        {
          id: 'mem-photo',
          type: 'MEMORY',
          titleOrText: 'Photo Memory',
          occurredOn: new Date('2026-09-01T12:00:00Z'),
          previewAttachmentId: 'att-123',
        },
        {
          id: 'mem-text',
          type: 'MEMORY',
          titleOrText: 'Text Memory',
          occurredOn: new Date('2026-08-30T12:00:00Z'),
        },
      ],
      retrospective: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={{} as M4ProductApis}
            spaceId="space-1"
            loadMemoryImage={() =>
              Promise.resolve('blob:http://localhost/mock')
            }
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // The server-provided keepsake becomes the large editorial focal point
    expect(html).toContain('today-section-moment');
    expect(html).toContain('today-moment-media');
    expect(html).toContain('Photo Memory');

    // It is not duplicated further down in the Shared Trace
    const keepsakeIndex = html.indexOf('today-section-moment');
    const traceIndex = html.indexOf('today-section-recent');
    const photoOccurrences = html.split('Photo Memory').length - 1;
    expect(photoOccurrences).toBe(1);
    expect(keepsakeIndex).toBeGreaterThan(-1);

    // The text-only memory still appears as a quiet Shared Trace row
    expect(traceIndex).toBeGreaterThan(-1);
    expect(html).toContain('Text Memory');
  });

  it('shows a real Keepsake even when many newer non-memory recentShared items would otherwise crowd it out (regression #790)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // The recentShared feed is entirely non-memory items, newer than the
    // photo memory. Under the old client-side scan of recentShared this would
    // have hidden the Keepsake entirely. The server-provided `keepsake` field
    // is independent of recentShared, so the real photo must still appear.
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
      relationshipDuration: null,
      upcoming: [],
      keepsake: {
        id: 'mem-photo-old',
        type: 'MEMORY',
        titleOrText: 'Anniversary Trip',
        occurredOn: new Date('2026-01-01T12:00:00Z'),
        previewAttachmentId: 'att-old',
      },
      recentShared: [
        {
          id: 'wish-1',
          type: 'WISH',
          titleOrText: 'Newer Wish',
          createdAt: new Date('2026-09-05T10:00:00Z'),
        },
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Newer Plan',
          createdAt: new Date('2026-09-04T10:00:00Z'),
        },
        {
          id: 'place-1',
          type: 'PLACE',
          titleOrText: 'Newer Place',
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
      ],
      retrospective: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={{} as M4ProductApis}
            spaceId="space-1"
            loadMemoryImage={() =>
              Promise.resolve('blob:http://localhost/mock')
            }
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('today-section-moment');
    expect(html).toContain('Anniversary Trip');
    expect(html).not.toContain('new-space-experience');
  });

  it('does not let a generic Keepsake outrank a genuinely current/upcoming signal (#840)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
      relationshipDuration: null,
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Weekend trip',
          scheduledAt: new Date('2026-09-15T10:00:00Z'),
        },
      ],
      keepsake: {
        id: 'mem-photo',
        type: 'MEMORY',
        titleOrText: 'Beach Day',
        occurredOn: new Date('2026-09-01T12:00:00Z'),
        previewAttachmentId: 'att-123',
      },
      recentShared: [],
      retrospective: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={{} as M4ProductApis}
            spaceId="space-1"
            loadMemoryImage={() =>
              Promise.resolve('blob:http://localhost/mock')
            }
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // A genuinely current/upcoming signal exists, so the Shared Planning
    // Horizon precedes the merely generic (non-retrospective) Keepsake.
    const planningIndex = html.indexOf('today-section-upcoming');
    const keepsakeIndex = html.indexOf('today-section-moment');
    expect(planningIndex).toBeGreaterThan(-1);
    expect(keepsakeIndex).toBeGreaterThan(planningIndex);

    // The Keepsake still appears, still warm/editorial, just not first.
    expect(html).toContain('Beach Day');
    expect(html).toContain('Weekend trip');
    expect(html.split('Beach Day').length - 1).toBe(1);
  });

  it('keeps a generic Keepsake as the prominent focal point when no current/upcoming signal exists (#840)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
      relationshipDuration: null,
      upcoming: [],
      keepsake: {
        id: 'mem-photo',
        type: 'MEMORY',
        titleOrText: 'Beach Day',
        occurredOn: new Date('2026-09-01T12:00:00Z'),
        previewAttachmentId: 'att-123',
      },
      recentShared: [
        {
          id: 'mem-text',
          type: 'MEMORY',
          titleOrText: 'Text Memory',
          occurredOn: new Date('2026-08-30T12:00:00Z'),
        },
      ],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
            loadMemoryImage={() =>
              Promise.resolve('blob:http://localhost/mock')
            }
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // No planning area exists at all, so the Keepsake remains the
    // page's leading editorial focus, ahead of the quiet Shared Trace.
    expect(html).not.toContain('today-section-upcoming');
    const keepsakeIndex = html.indexOf('today-section-moment');
    const traceIndex = html.indexOf('today-section-recent');
    expect(keepsakeIndex).toBeGreaterThan(-1);
    expect(traceIndex).toBeGreaterThan(keepsakeIndex);
  });

  it("keeps the planning area's internal upcoming/signal order intact when a generic Keepsake also exists (#840)", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: null,
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Candlelight Dinner',
          scheduledAt: new Date('2026-09-10T19:00:00Z'),
        },
      ],
      keepsake: {
        id: 'mem-photo',
        type: 'MEMORY',
        titleOrText: 'Sunset Photo',
        occurredOn: new Date('2026-09-01T12:00:00Z'),
        previewAttachmentId: 'att-123',
      },
      recentShared: [],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [
        {
          id: 'act-1',
          kind: 'COMMENT_CREATED',
          actorId: 'partner-1',
          targetId: 'mem-1',
          targetType: 'MEMORY',
          createdAt: new Date('2026-09-03T12:00:00Z'),
          occurredAt: new Date('2026-09-03T12:00:00Z'),
          sourceEventId: 'ev-1',
        },
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
            loadMemoryImage={() =>
              Promise.resolve('blob:http://localhost/mock')
            }
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // #850 replaced the shared two-zone planning area with the normative
    // section order, which keeps #840's invariant structurally rather than
    // conditionally: the upcoming agenda always precedes the Keepsake, and
    // the partner signal is now the `Gerade bei euch` module below it.
    expect(html).not.toContain('today-planning-dual');
    const agendaIndex = html.indexOf('today-agenda-row');
    const momentIndex = html.indexOf('today-section-moment');
    const signalIndex = html.indexOf('today-living');
    expect(agendaIndex).toBeGreaterThan(-1);
    expect(momentIndex).toBeGreaterThan(agendaIndex);
    expect(signalIndex).toBeGreaterThan(momentIndex);
  });

  it('places a genuine date-specific retrospective in the single `Gerade bei euch` slot (#850 supersedes #840 ordering)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
      relationshipDuration: null,
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Weekend trip',
          scheduledAt: new Date('2026-09-15T10:00:00Z'),
        },
      ],
      retrospective: {
        id: 'heart-1',
        type: 'HEART_MOMENT',
        titleOrText: 'One year ago today',
        createdAt: new Date('2025-09-09T08:00:00Z'),
      },
      recentShared: [],
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // #840 let a date-specific retrospective float ahead of the planning
    // area. #850's normative order is fixed, and the retrospective is now
    // the highest-value candidate for the one `Gerade bei euch` slot after a
    // live partner signal - so it renders there, below `Demnächst`. The
    // retrospective is still shown, still exactly once, and still never
    // displaced by a generic Keepsake, which is what #840 was protecting.
    const planningIndex = html.indexOf('today-section-upcoming');
    const livingIndex = html.indexOf('today-section-living');
    expect(planningIndex).toBeGreaterThan(-1);
    expect(livingIndex).toBeGreaterThan(planningIndex);
    expect(html).toContain('One year ago today');
    expect(html.split('One year ago today').length - 1).toBe(1);
    expect(html).toContain('today-living-retrospective');
  });

  it('uses a deliberate text-first `Euer Moment`, never an empty photo frame, when no image can render', () => {
    const html = renderTodayPage({
      space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
      relationshipDuration: null,
      upcoming: [],
      keepsake: {
        id: 'mem-photo',
        type: 'MEMORY',
        titleOrText: 'Photo Memory',
        occurredOn: new Date('2026-09-01T12:00:00Z'),
        previewAttachmentId: 'att-123',
      },
      recentShared: [
        {
          id: 'mem-photo',
          type: 'MEMORY',
          titleOrText: 'Photo Memory',
          occurredOn: new Date('2026-09-01T12:00:00Z'),
          previewAttachmentId: 'att-123',
        },
      ],
      retrospective: null,
    });

    // No image loader means no photo to lead with. The anchor keeps its
    // place as a quiet one-line state rather than rendering an empty frame,
    // The actual shared words remain the focal content and canonical target.
    expect(html).not.toContain('today-moment-figure');
    expect(html).toContain('today-moment-text');
    expect(html).toContain('Photo Memory');
    expect(html).toContain('href="/story/memories/mem-photo"');
    expect(html).not.toContain('today-moment-compact');
    expect(html).toContain('Photo Memory');
  });

  it('renders compact shared-life mini-tiles (not activity-log cards) and secondary all-activity action', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
      relationshipDuration: null,
      upcoming: [],
      recentShared: [
        {
          id: 'item-1',
          type: 'CHAPTER',
          titleOrText: 'Summer Chapter',
          occurredOn: new Date('2026-09-04T10:00:00Z'),
        },
        {
          id: 'item-2',
          type: 'COLLECTION',
          titleOrText: 'Rainy Day Movies',
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
        {
          id: 'item-3',
          type: 'HEART_MOMENT',
          titleOrText: 'Love Note',
          occurredOn: new Date('2026-09-01T10:00:00Z'),
        },
        {
          id: 'item-4',
          type: 'MILESTONE',
          titleOrText: 'First Shared Home',
          occurredOn: new Date('2026-08-01T10:00:00Z'),
        },
        {
          id: 'item-5',
          type: 'MEMORY',
          titleOrText: 'Fifth entry',
          occurredOn: new Date('2026-07-01T10:00:00Z'),
        },
        {
          id: 'item-6',
          type: 'MEMORY',
          titleOrText: 'Should be sliced out',
          occurredOn: new Date('2026-06-01T10:00:00Z'),
        },
      ],
      retrospective: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage apis={{} as M4ProductApis} spaceId="space-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Renders section with distinct kicker and heading (no duplicate wording)
    expect(html).toContain(m5s5.dashboard.recentKicker);
    expect(html).toContain(m5s5.dashboard.recentTitle);
    // The descriptive subline read as redundant activity-log copy and was
    // removed per Product Owner review; the section no longer renders one.
    expect(html).not.toContain('today-section-subline');

    // Renders as small, soft mini-tiles, not the old activity-log/database
    // record cards (icon-badge + heading + kind/date subtitle stacked in a
    // vertical list).
    expect(html).toContain('today-recent-tile');
    expect(html).not.toContain('recent-shared-card');
    expect(html).toContain('Summer Chapter');
    expect(html).toContain('Rainy Day Movies');

    // Type is still available to assistive tech, just not as its own
    // visible badge next to an already type-specific icon.
    expect(html).toContain('sr-only');
    expect(html).toContain(m5s5.kind.CHAPTER);
    expect(html).toContain(m5s5.kind.COLLECTION);

    // Still caps the remaining trace at four after higher-priority content is
    // de-duplicated. A later item may enter the bounded trace when earlier
    // items become the focal/context subjects.
    expect(html.match(/today-recent-tile"/g)).toHaveLength(4);

    // Whatever the page already features above (here the Milestone, promoted
    // into the single `Gerade bei euch` slot) is not repeated as a trace row.
    expect(html).toContain('today-living-milestone');
    expect(html.split('First Shared Home').length - 1).toBe(1);

    // Offers secondary action to full activity page
    expect(html).toContain('href="/today/activity"');
    expect(html).toContain(m5s5.dashboard.allActivityAction);
  });

  it('orchestrates primary contextual slot and relationship signal when partner activity exists', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 100 },
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Candlelight Dinner',
          scheduledAt: new Date('2026-09-10T19:00:00Z'),
        },
      ],
      recentShared: [
        {
          id: 'mem-1',
          type: 'MEMORY',
          titleOrText: 'Lake Walk',
          occurredOn: new Date('2026-09-02T16:00:00Z'),
        },
      ],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [
        {
          id: 'act-1',
          kind: 'COMMENT_CREATED',
          actorId: 'partner-1',
          targetId: 'mem-signal',
          targetType: 'MEMORY',
          createdAt: new Date('2026-09-03T12:00:00Z'),
          occurredAt: new Date('2026-09-03T12:00:00Z'),
          sourceEventId: 'ev-1',
        },
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Demnächst: the upcoming item is a calm agenda row, not a
    // dashboard-style status card. Under #850 it owns its own section rather
    // than sharing a two-zone planning area with the partner signal.
    expect(html).toContain('today-section-upcoming');
    expect(html).not.toContain('today-planning-dual');
    expect(html).toContain('today-agenda-row');
    expect(html).toContain('Candlelight Dinner');
    expect(html).not.toContain('today-context-card');

    // The partner signal is the single `Gerade bei euch` module, below.
    expect(html).toContain('today-section-living');
    expect(html).toContain('today-living-partner_signal');
    expect(html).toContain('href="/story/memories/mem-signal"');
    expect(html).toContain('today-living-action');
    expect(html.indexOf('today-section-living')).toBeGreaterThan(
      html.indexOf('today-section-upcoming'),
    );

    // Exactly one contextual module, never a stack.
    expect(html.split('today-section-living').length - 1).toBe(1);

    // Zero duplication: the upcoming item appears exactly once
    expect(html.split('Candlelight Dinner').length - 1).toBe(1);
  });

  it('omits the planning area entirely when neither upcoming item nor relationship activity exists', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 50 },
      upcoming: [],
      recentShared: [
        {
          id: 'mem-1',
          type: 'MEMORY',
          titleOrText: 'Lake Walk',
          occurredOn: new Date('2026-09-02T16:00:00Z'),
        },
      ],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Planning area is completely omitted
    expect(html).not.toContain('today-section-upcoming');
    expect(html).not.toContain('today-living');

    // The single real Memory is enough to form the focal composition; no
    // duplicate recent trace or filler section is added.
    expect(html).toContain('today-section-moment');
    expect(html).not.toContain('today-section-recent');
    expect(html).toContain('Lake Walk');
  });

  it('renders `Demnächst` alone, with no `Gerade bei euch` module, when only an upcoming item exists', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 50 },
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Cooking Night',
          scheduledAt: new Date('2026-09-05T18:00:00Z'),
        },
      ],
      recentShared: [],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('today-section-upcoming');
    expect(html).toContain('today-agenda-row');
    expect(html).toContain('Cooking Night');
    // Nothing qualifies for the contextual slot, so the section is omitted
    // entirely rather than rendered as an empty placeholder.
    expect(html).not.toContain('today-section-living');
  });

  it('renders only the `Gerade bei euch` module, and no `Demnächst`, when just a partner signal exists', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 50 },
      upcoming: [],
      recentShared: [],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [
        {
          id: 'act-1',
          kind: 'COMMENT_CREATED',
          actorId: 'partner-1',
          targetId: 'mem-99',
          targetType: 'MEMORY',
          createdAt: new Date('2026-09-03T14:00:00Z'),
          occurredAt: new Date('2026-09-03T14:00:00Z'),
          sourceEventId: 'ev-99',
        },
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // No upcoming item means no `Demnächst` section at all; the partner
    // signal still gets its own contextual slot.
    expect(html).not.toContain('today-section-upcoming');
    expect(html).not.toContain('today-agenda-row');
    expect(html).toContain('today-section-living');
    expect(html).toContain('today-living-partner_signal');
    expect(html).toContain('href="/story/memories/mem-99"');
  });

  it('renders every upcoming item as a calm agenda row in one Shared Planning Horizon, not a split primary card + secondary section', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 50 },
      upcoming: [
        {
          id: 'plan-primary',
          type: 'PLAN',
          titleOrText: 'First Next Plan',
          scheduledAt: new Date('2026-09-05T18:00:00Z'),
        },
        {
          id: 'plan-secondary',
          type: 'PLAN',
          titleOrText: 'Second Future Plan',
          scheduledAt: new Date('2026-09-20T18:00:00Z'),
        },
      ],
      recentShared: [],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [],
      nextCursor: null,
    });
    queryClient.setQueryData(
      dashboardPreferencesQueryKey('account-1', 'space-1'),
      { items: [{ moduleKey: 'upcoming', itemLimit: 2 }] },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
            account={{ id: 'account-1', displayName: 'Alex' }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('today-section-upcoming');
    expect(html).toContain('today-agenda-list');
    expect(html).not.toContain('today-context-card');

    // Both items render as agenda rows in the same list, in order
    const firstIndex = html.indexOf('First Next Plan');
    const secondIndex = html.indexOf('Second Future Plan');
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it('does not render relationship signal when comment is from the user or another actor', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 50 },
      upcoming: [],
      recentShared: [
        {
          id: 'mem-1',
          type: 'MEMORY',
          titleOrText: 'Lake Walk',
          occurredOn: new Date('2026-09-02T16:00:00Z'),
        },
      ],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [
        {
          id: 'act-own',
          kind: 'COMMENT_CREATED',
          actorId: 'user-self',
          targetId: 'mem-1',
          targetType: 'MEMORY',
          createdAt: new Date('2026-09-03T14:00:00Z'),
          occurredAt: new Date('2026-09-03T14:00:00Z'),
          sourceEventId: 'ev-own',
        },
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).not.toContain('today-living');
  });

  it('does not render relationship signal when comment actorId is null', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 50 },
      upcoming: [],
      recentShared: [
        {
          id: 'mem-1',
          type: 'MEMORY',
          titleOrText: 'Lake Walk',
          occurredOn: new Date('2026-09-02T16:00:00Z'),
        },
      ],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [
        {
          id: 'act-null',
          kind: 'COMMENT_CREATED',
          actorId: null,
          targetId: 'mem-1',
          targetType: 'MEMORY',
          createdAt: new Date('2026-09-03T14:00:00Z'),
          occurredAt: new Date('2026-09-03T14:00:00Z'),
          sourceEventId: 'ev-null',
        },
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).not.toContain('today-living');
  });

  it('does not render relationship signal when space has no partner', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: null,
      },
      relationshipDuration: null,
      upcoming: [],
      recentShared: [
        {
          id: 'mem-1',
          type: 'MEMORY',
          titleOrText: 'Solo Memory',
          occurredOn: new Date('2026-09-02T16:00:00Z'),
        },
      ],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [
        {
          id: 'act-1',
          kind: 'COMMENT_CREATED',
          actorId: 'partner-1',
          targetId: 'mem-1',
          targetType: 'MEMORY',
          createdAt: new Date('2026-09-03T14:00:00Z'),
          occurredAt: new Date('2026-09-03T14:00:00Z'),
          sourceEventId: 'ev-1',
        },
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).not.toContain('today-living');
  });

  it('does not render relationship signal for non-comment activity', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: { daysTogether: 50 },
      upcoming: [],
      recentShared: [
        {
          id: 'mem-1',
          type: 'MEMORY',
          titleOrText: 'Lake Walk',
          occurredOn: new Date('2026-09-02T16:00:00Z'),
        },
      ],
      retrospective: null,
    });
    queryClient.setQueryData(['m4', 'activity', 'space-1'], {
      items: [
        {
          id: 'act-memory',
          kind: 'MEMORY_CREATED',
          actorId: 'partner-1',
          targetId: 'mem-1',
          targetType: 'MEMORY',
          createdAt: new Date('2026-09-03T14:00:00Z'),
          occurredAt: new Date('2026-09-03T14:00:00Z'),
          sourceEventId: 'ev-mem',
        },
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodayPage
            apis={
              {
                activity: {
                  getActivity: () =>
                    Promise.resolve({ items: [], nextCursor: null }),
                },
              } as unknown as M4ProductApis
            }
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).not.toContain('today-living');
  });

  it('renders neutral settings CTA when relationshipDuration is null without assuming missing start date', () => {
    const html = renderTodayPage({
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: null,
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Picnic in the park',
          scheduledAt: new Date('2026-09-15T10:00:00Z'),
        },
      ],
      recentShared: [],
      retrospective: null,
    });

    expect(html).not.toContain('today-hero-settings-link');
    expect(html).not.toContain('today-hero-duration-link');
    expect(html).not.toContain('Beziehungseinstellungen öffnen');
    expect(html).not.toContain('Beziehungsstart festlegen');
  });

  it('links duration pill to relationship profile when relationshipDuration is present in DAYS mode', () => {
    const html = renderTodayPage({
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: {
        daysTogether: 100,
        displayMode: DurationDisplayMode.DAYS,
        startedOn: new Date('2026-01-01T00:00:00Z'),
      },
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Picnic in the park',
          scheduledAt: new Date('2026-09-15T10:00:00Z'),
        },
      ],
      recentShared: [],
      retrospective: null,
    });

    expect(html).toContain('today-hero-duration-link');
    expect(html).toContain('100 Tage zusammen');
    expect(html).toContain('href="/more/profile#relationship-profile-title"');
    expect(html).not.toContain('today-hero-settings-link');
  });

  it('renders formatted duration in YEARS_MONTHS mode', () => {
    const html = renderTodayPage({
      space: {
        id: 'space-1',
        partner: { id: 'partner-1', displayName: 'Marie' },
      },
      relationshipDuration: {
        daysTogether: 1156,
        displayMode: DurationDisplayMode.YEARS_MONTHS,
        startedOn: new Date('2023-01-01T00:00:00Z'),
      },
      upcoming: [
        {
          id: 'plan-1',
          type: 'PLAN',
          titleOrText: 'Picnic in the park',
          scheduledAt: new Date('2026-09-15T10:00:00Z'),
        },
      ],
      recentShared: [],
      retrospective: null,
    });

    expect(html).toContain('today-hero-duration-link');
    expect(html).toContain('3 Jahre, 2 Monate zusammen');
    expect(html).not.toContain('today-hero-settings-link');
  });
});

/*
 * The no-duplicate composition contract for a partner signal.
 *
 * A partner comment renders as `Gerade bei euch`, but what it is *about* is an
 * ordinary shared item that `Diesen Monat` and `Zuletzt bei euch` would
 * otherwise show again. The commented item's id therefore counts as featured
 * content for both sections.
 */
function renderWithPartnerComment(commentTargetId: string): string {
  const now = new Date();
  const thisMonth = (day: number) =>
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), day));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
    space: {
      id: 'space-1',
      partner: { id: 'partner-1', displayName: 'Marie' },
    },
    relationshipDuration: null,
    upcoming: [],
    keepsake: {
      id: 'mem-featured',
      type: 'MEMORY',
      titleOrText: 'Featured Photo',
      occurredOn: thisMonth(2),
      previewAttachmentId: 'att-featured',
    },
    recentShared: [
      {
        id: 'mem-featured',
        type: 'MEMORY',
        titleOrText: 'Featured Photo',
        occurredOn: thisMonth(2),
        previewAttachmentId: 'att-featured',
      },
      {
        id: 'mem-commented',
        type: 'MEMORY',
        titleOrText: 'Commented Photo',
        occurredOn: thisMonth(3),
        previewAttachmentId: 'att-commented',
      },
      {
        id: 'mem-other',
        type: 'MEMORY',
        titleOrText: 'Other Photo',
        occurredOn: thisMonth(4),
        previewAttachmentId: 'att-other',
      },
      {
        id: 'ms-1',
        type: 'MILESTONE',
        titleOrText: 'Shared Milestone',
        occurredOn: thisMonth(5),
      },
    ],
    retrospective: null,
  });
  queryClient.setQueryData(['m4', 'activity', 'space-1'], {
    items: [
      {
        id: 'act-1',
        kind: 'COMMENT_CREATED',
        actorId: 'partner-1',
        targetId: commentTargetId,
        targetType: 'MEMORY',
        createdAt: new Date(),
        occurredAt: new Date(),
        sourceEventId: 'ev-1',
      },
    ],
    nextCursor: null,
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayPage
          apis={
            {
              activity: {
                getActivity: () =>
                  Promise.resolve({ items: [], nextCursor: null }),
              },
            } as unknown as M4ProductApis
          }
          spaceId="space-1"
          loadMemoryImage={() => Promise.resolve('blob:http://localhost/x')}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('skips a partner comment about the current `Euer Moment` and selects the next eligible module', () => {
  const html = renderWithPartnerComment('mem-featured');

  // The signal would have duplicated the photo shown large above, so the
  // chain continued to the next eligible candidate.
  expect(html).not.toContain('today-living-partner_signal');
  expect(html).toContain('today-living-milestone');
  expect(html).toContain('Shared Milestone');
  // Exactly one contextual module, as always.
  expect(html.split('today-section-living').length - 1).toBe(1);
});

it('never repeats the memory a partner commented on in `Diesen Monat` or the trace', () => {
  const html = renderWithPartnerComment('mem-commented');

  // The partner signal wins precedence, because its target is not featured.
  expect(html).toContain('today-living-partner_signal');

  // Its underlying memory is featured content now, so neither later section
  // shows it again.
  expect(html).toContain('today-section-monthly');
  expect(html).not.toContain('Commented Photo');

  // The unrelated entries are still there, so nothing was over-filtered.
  expect(html).toContain('Other Photo');
  expect(html).toContain('Shared Milestone');
});

it('keeps an unrelated partner signal winning precedence over the stable candidates', () => {
  const html = renderWithPartnerComment('mem-elsewhere');

  expect(html).toContain('today-living-partner_signal');
  expect(html).not.toContain('today-living-milestone');
  // Nothing is filtered out of the later sections by an off-page target.
  expect(html).toContain('Commented Photo');
  expect(html).toContain('Other Photo');
});

/**
 * The markup of one composed section, so an assertion can say *where* a title
 * appears. `Diesen Monat` carries its titles in an `sr-only` span and the
 * trace carries them in a visible one, so a whole-page `toContain` cannot
 * tell a thumbnail apart from a row. Sections are siblings and never nested,
 * so slicing to the next `<section` is exact.
 */
function sectionHtml(html: string, className: string): string {
  const start = html.indexOf(`today-section ${className}`);
  if (start === -1) return '';
  const rest = html.slice(start);
  const next = rest.indexOf('<section', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

/*
 * A Space with more this-month photos than the strip can hold, plus content
 * the strip never takes. It pins both halves of the trace's exclusion rule:
 * the photos the strip actually selected are gone from the trace, and
 * everything it did not select is still there.
 */
function renderMonthlyOverflowSpace(): string {
  const now = new Date();
  const thisMonth = (day: number) =>
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), day));
  const photo = (id: string, title: string, day: number) => ({
    id,
    type: 'MEMORY',
    titleOrText: title,
    occurredOn: thisMonth(day),
    previewAttachmentId: `att-${id}`,
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
    space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
    relationshipDuration: null,
    upcoming: [],
    keepsake: photo('mem-hero', 'Hero Photo', 1),
    recentShared: [
      photo('mem-hero', 'Hero Photo', 1),
      photo('mem-a', 'Strip Photo A', 2),
      photo('mem-b', 'Strip Photo B', 3),
      photo('mem-c', 'Strip Photo C', 4),
      // A fourth this-month photo the three-item cap leaves unselected.
      photo('mem-d', 'Overflow Photo D', 5),
      {
        id: 'hm-1',
        type: 'HEART_MOMENT',
        titleOrText: 'Quiet Heart Moment',
        occurredOn: thisMonth(6),
        previewAttachmentId: null,
      },
      {
        id: 'ms-1',
        type: 'MILESTONE',
        titleOrText: 'Shared Milestone',
        occurredOn: thisMonth(7),
        previewAttachmentId: null,
      },
    ],
    retrospective: null,
  });
  queryClient.setQueryData(['m4', 'activity', 'space-1'], {
    items: [],
    nextCursor: null,
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayPage
          apis={{} as M4ProductApis}
          spaceId="space-1"
          loadMemoryImage={() => Promise.resolve('blob:http://localhost/x')}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('never repeats a `Diesen Monat` photo as a `Zuletzt bei euch` row', () => {
  const html = renderMonthlyOverflowSpace();
  const monthly = sectionHtml(html, 'today-section-monthly');
  const trace = sectionHtml(html, 'today-section-recent');

  // The strip took the three eligible photos below the featured one.
  expect(html).toContain('today-monthly-strip-3');
  for (const title of ['Strip Photo A', 'Strip Photo B', 'Strip Photo C']) {
    expect(monthly).toContain(title);
    expect(trace).not.toContain(title);
  }
});

it('keeps content the monthly strip did not select eligible for the trace', () => {
  const html = renderMonthlyOverflowSpace();
  const monthly = sectionHtml(html, 'today-section-monthly');
  const trace = sectionHtml(html, 'today-section-recent');

  // The fourth this-month photo lost only to the three-item cap, so it is
  // not featured anywhere and the trace must still offer it.
  expect(monthly).not.toContain('Overflow Photo D');
  expect(trace).toContain('Overflow Photo D');

  // Content the strip can never take stays in the trace too.
  expect(trace).toContain('Quiet Heart Moment');
});

it('keeps `Euer Moment` and the `Gerade bei euch` module out of the trace as before', () => {
  const html = renderMonthlyOverflowSpace();
  const trace = sectionHtml(html, 'today-section-recent');

  // Featured above as the photo anchor.
  expect(html).toContain('today-moment-figure');
  expect(trace).not.toContain('Hero Photo');

  // Featured above as the single contextual module.
  expect(html).toContain('today-living-milestone');
  expect(trace).not.toContain('Shared Milestone');
});

it('leaves the trace untouched when the month contributes no photos', () => {
  const html = renderTodayPage({
    space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
    relationshipDuration: null,
    upcoming: [],
    recentShared: [
      {
        id: 'hm-1',
        type: 'HEART_MOMENT',
        titleOrText: 'Text Only Moment',
        occurredOn: new Date(),
      },
      {
        id: 'ch-1',
        type: 'CHAPTER',
        titleOrText: 'Shared Chapter',
        occurredOn: new Date(),
      },
    ],
    retrospective: null,
  });

  // No strip at all, so it can exclude nothing from the trace.
  expect(html).not.toContain('today-section-monthly');
  const trace = sectionHtml(html, 'today-section-recent');
  expect(sectionHtml(html, 'today-section-moment')).toContain(
    'Text Only Moment',
  );
  expect(trace).not.toContain('Text Only Moment');
  expect(trace).toContain('Shared Chapter');
});

it('renders `Diesen Monat` as up to three real shared photos, never a count derived from the capped feed', () => {
  const now = new Date();
  // `occurredOn` is a date-only API value: the generated client materializes
  // it at midnight UTC, so the fixture is built the same way.
  const thisMonth = (day: number) =>
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), day));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
    space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
    relationshipDuration: null,
    upcoming: [],
    keepsake: {
      id: 'featured',
      type: 'MEMORY',
      titleOrText: 'Featured Photo',
      occurredOn: thisMonth(2),
      previewAttachmentId: 'att-featured',
    },
    recentShared: [
      {
        id: 'featured',
        type: 'MEMORY',
        titleOrText: 'Featured Photo',
        occurredOn: thisMonth(2),
        previewAttachmentId: 'att-featured',
      },
      ...[1, 2, 3, 4].map((n) => ({
        id: `strip-${n}`,
        type: 'MEMORY',
        titleOrText: `Strip Photo ${n}`,
        occurredOn: thisMonth(3),
        previewAttachmentId: `att-strip-${n}`,
      })),
    ],
    retrospective: null,
  });

  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayPage
          apis={{} as M4ProductApis}
          spaceId="space-1"
          loadMemoryImage={() => Promise.resolve('blob:http://localhost/x')}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(html).toContain('today-monthly-strip-3');
  expect(html.split('today-monthly-tile"').length - 1).toBe(3);
  // The photo already shown large above is not repeated in the strip.
  expect(html).toContain('today-monthly-strip');
  expect(html).not.toContain('att-featured-strip');
  // No total is claimed: recentShared is capped server-side, so a count
  // derived from it could be wrong.
  expect(html).not.toMatch(/\d+\s+gemeinsame Momente/);
});

it('`Diesen Monat` -> Alle anzeigen opens Momente on the Zeitleiste tab, not Entdecken', () => {
  const html = renderMonthlyOverflowSpace();
  const monthly = sectionHtml(html, 'today-section-monthly');

  // The real-smartphone Product Owner decision (#858 follow-up): the
  // monthly strip's header action must resolve to the Story view's
  // Zeitleiste tab, not the bare `/story` root (which defaults to
  // Entdecken).
  expect(monthly).toContain('href="/story?tab=timeline"');
});

it('omits `Diesen Monat` entirely when the month has no shared photo', () => {
  const html = renderTodayPage({
    space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
    relationshipDuration: null,
    upcoming: [],
    recentShared: [
      {
        id: 'hm-1',
        type: 'HEART_MOMENT',
        titleOrText: 'Nur Text',
        occurredOn: new Date(),
      },
    ],
    retrospective: null,
  });

  expect(html).not.toContain('today-section-monthly');
  expect(html).not.toContain('today-monthly-strip');
});

it('never exposes the internal `keepsake` term to users', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
    space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
    relationshipDuration: null,
    upcoming: [],
    keepsake: {
      id: 'mem-photo',
      type: 'MEMORY',
      titleOrText: 'Photo Memory',
      occurredOn: new Date('2026-09-01T12:00:00Z'),
      previewAttachmentId: 'att-123',
    },
    recentShared: [],
    retrospective: null,
  });

  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayPage
          apis={{} as M4ProductApis}
          spaceId="space-1"
          loadMemoryImage={() => Promise.resolve('blob:http://localhost/x')}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // Visible copy only - class names may still carry internal role names.
  const visibleText = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  expect(visibleText).not.toContain('keepsake');
  expect(html).toContain(m5s5.today.keepsake.kicker);
});

it('keeps the Thinking-of-you action in the hero, unchanged by the recomposition', () => {
  const html = renderTodayPage({
    space: { id: 'space-1', partner: { id: 'p-1', displayName: 'Sam' } },
    relationshipDuration: { daysTogether: 100 },
    upcoming: [
      {
        id: 'plan-1',
        type: 'PLAN',
        titleOrText: 'Kino',
        scheduledAt: new Date('2026-09-20T18:00:00Z'),
      },
    ],
    recentShared: [],
    retrospective: null,
  });

  const heroIndex = html.indexOf('today-hero');
  const actionIndex = html.indexOf('today-hero-action');
  const upcomingIndex = html.indexOf('today-section-upcoming');
  expect(actionIndex).toBeGreaterThan(heroIndex);
  expect(upcomingIndex).toBeGreaterThan(actionIndex);
  expect(html).toContain(m5s5.dashboard.thinkingOfYouButton);
});

describe('formatRelationshipDuration', () => {
  it('formats DAYS mode for singular and plural', () => {
    expect(
      formatRelationshipDuration(
        {
          daysTogether: 1,
          displayMode: DurationDisplayMode.DAYS,
          startedOn: new Date('2026-01-01T00:00:00Z'),
        },
        i18n.t,
      ),
    ).toBe('1 Tag zusammen');

    expect(
      formatRelationshipDuration(
        {
          daysTogether: 1178,
          displayMode: DurationDisplayMode.DAYS,
          startedOn: new Date('2023-01-01T00:00:00Z'),
        },
        i18n.t,
      ),
    ).toBe('1178 Tage zusammen');
  });

  it('formats YEARS_MONTHS mode with singular and plural units', () => {
    // Exactly 3 years, 2 months:
    // start 2023-01-01, + 1156 days -> 2026-03-02
    expect(
      formatRelationshipDuration(
        {
          daysTogether: 1156,
          displayMode: DurationDisplayMode.YEARS_MONTHS,
          startedOn: new Date('2023-01-01T00:00:00Z'),
        },
        i18n.t,
      ),
    ).toBe('3 Jahre, 2 Monate zusammen');

    // 1 year, 1 month:
    // start 2025-01-01, + 396 days -> 2026-02-01
    expect(
      formatRelationshipDuration(
        {
          daysTogether: 396,
          displayMode: DurationDisplayMode.YEARS_MONTHS,
          startedOn: new Date('2025-01-01T00:00:00Z'),
        },
        i18n.t,
      ),
    ).toBe('1 Jahr, 1 Monat zusammen');
  });

  it('formats YEARS_MONTHS mode when months == 0', () => {
    // Exactly 3 years, 0 months:
    // start 2023-01-01, + 1096 days -> 2026-01-01
    expect(
      formatRelationshipDuration(
        {
          daysTogether: 1096,
          displayMode: DurationDisplayMode.YEARS_MONTHS,
          startedOn: new Date('2023-01-01T00:00:00Z'),
        },
        i18n.t,
      ),
    ).toBe('3 Jahre zusammen');
  });

  it('formats YEARS_MONTHS mode when years == 0 and months > 0', () => {
    // 0 years, 2 months:
    // start 2026-01-01, + 62 days -> 2026-03-04
    expect(
      formatRelationshipDuration(
        {
          daysTogether: 62,
          displayMode: DurationDisplayMode.YEARS_MONTHS,
          startedOn: new Date('2026-01-01T00:00:00Z'),
        },
        i18n.t,
      ),
    ).toBe('2 Monate zusammen');

    // 0 years, 1 month:
    expect(
      formatRelationshipDuration(
        {
          daysTogether: 32,
          displayMode: DurationDisplayMode.YEARS_MONTHS,
          startedOn: new Date('2026-01-01T00:00:00Z'),
        },
        i18n.t,
      ),
    ).toBe('1 Monat zusammen');
  });

  it('falls back to days when years == 0 and months == 0', () => {
    expect(
      formatRelationshipDuration(
        {
          daysTogether: 15,
          displayMode: DurationDisplayMode.YEARS_MONTHS,
          startedOn: new Date('2026-01-01T00:00:00Z'),
        },
        i18n.t,
      ),
    ).toBe('15 Tage zusammen');
  });

  describe('issue #617: keep third-party dates out of the planning area', () => {
    it('renders the shared plan in the planning area when upcoming contains a couple plan', () => {
      const html = renderTodayPage({
        space: {
          id: 'space-1',
          partner: { id: 'partner-1', displayName: 'Sam' },
        },
        relationshipDuration: null,
        upcoming: [
          {
            id: 'plan-1',
            type: 'PLAN',
            titleOrText: 'Weekend by the lake',
            scheduledAt: new Date('2026-09-10T10:00:00Z'),
          },
        ],
        recentShared: [],
        retrospective: null,
      });

      expect(html).toContain('today-section-upcoming');
      expect(html).toContain('Weekend by the lake');
    });

    it('omits the planning area when upcoming is empty (no forced fallback for third-party dates)', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], {
        space: {
          id: 'space-1',
          partner: { id: 'partner-1', displayName: 'Sam' },
        },
        relationshipDuration: { daysTogether: 100 },
        upcoming: [], // Filtered at projection boundary (#617)
        recentShared: [
          {
            id: 'mem-1',
            type: 'MEMORY',
            titleOrText: 'Konzertbesuch',
            occurredOn: new Date('2026-09-01T19:00:00Z'),
          },
        ],
        retrospective: null,
      });
      queryClient.setQueryData(['m4', 'activity', 'space-1'], {
        items: [],
        nextCursor: null,
      });

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TodayPage apis={{} as M4ProductApis} spaceId="space-1" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Planning area must disappear cleanly; page flows directly into recent shared
      expect(html).not.toContain('today-section-upcoming');
      expect(html).toContain('Konzertbesuch');
    });

    it('renders couple anniversary as an eligible agenda item', () => {
      const html = renderTodayPage({
        space: {
          id: 'space-1',
          partner: { id: 'partner-1', displayName: 'Sam' },
        },
        relationshipDuration: { daysTogether: 730 },
        upcoming: [
          {
            id: 'anniv-1',
            type: 'ANNIVERSARY',
            titleOrText: 'Jahrestag',
            occurredOn: new Date('2026-09-12T00:00:00Z'),
          },
        ],
        recentShared: [],
        retrospective: null,
      });

      expect(html).toContain('today-section-upcoming');
      expect(html).toContain('today-agenda-row');
      expect(html).toContain('Jahrestag');
    });

    it('renders couple important date as an eligible agenda item', () => {
      const html = renderTodayPage({
        space: {
          id: 'space-1',
          partner: { id: 'partner-1', displayName: 'Sam' },
        },
        relationshipDuration: { daysTogether: 730 },
        upcoming: [
          {
            id: 'date-1',
            type: 'IMPORTANT_DATE',
            titleOrText: 'Zusammengezogen',
            occurredOn: new Date('2026-09-15T00:00:00Z'),
          },
        ],
        recentShared: [],
        retrospective: null,
      });

      expect(html).toContain('today-section-upcoming');
      expect(html).toContain('Zusammengezogen');
    });
  });

  describe('per-user module visibility (#817)', () => {
    const now = new Date();
    const thisMonth = (day: number) =>
      new Date(Date.UTC(now.getFullYear(), now.getMonth(), day));

    function allModulesEligibleDashboard() {
      return {
        space: {
          id: 'space-1',
          partner: { id: 'partner-1', displayName: 'Marie' },
        },
        relationshipDuration: null,
        upcoming: [
          {
            id: 'plan-1',
            type: 'PLAN',
            titleOrText: 'Weekend trip',
            scheduledAt: new Date(Date.now() + 86_400_000),
          },
        ],
        keepsake: {
          id: 'mem-keepsake',
          type: 'MEMORY',
          titleOrText: 'Keepsake Photo',
          occurredOn: thisMonth(1),
          previewAttachmentId: 'att-keepsake',
        },
        recentShared: [
          {
            id: 'mem-keepsake',
            type: 'MEMORY',
            titleOrText: 'Keepsake Photo',
            occurredOn: thisMonth(1),
            previewAttachmentId: 'att-keepsake',
          },
          {
            id: 'mem-monthly',
            type: 'MEMORY',
            titleOrText: 'Monthly Photo',
            occurredOn: thisMonth(2),
            previewAttachmentId: 'att-monthly',
          },
          {
            id: 'ms-recent',
            type: 'MILESTONE',
            titleOrText: 'Trace Milestone',
            createdAt: new Date(),
          },
        ],
        retrospective: {
          id: 'heart-signal',
          type: 'HEART_MOMENT',
          titleOrText: 'Weisst du noch',
          occurredOn: new Date('2020-01-01T00:00:00Z'),
        },
        sharedStorySummary: {
          memories: 4,
          heartMoments: 1,
          milestones: 0,
        },
      };
    }

    function renderWithVisibility(
      overrides: Partial<Record<DashboardModuleKey, boolean>>,
    ): string {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClient.setQueryData(
        ['m5-s5', 'dashboard', 'space-1'],
        allModulesEligibleDashboard(),
      );
      // A resolved (possibly empty) preferences response - not pending, see
      // the dedicated "never flashes" test below for the pending case.
      queryClient.setQueryData(
        dashboardPreferencesQueryKey('account-1', 'space-1'),
        {
          items: Object.entries(overrides).map(([moduleKey, visible]) => ({
            moduleKey,
            visible,
          })),
        },
      );

      return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TodayPage
              apis={{} as M4ProductApis}
              spaceId="space-1"
              account={{ id: 'account-1', displayName: 'Alex' }}
              loadMemoryImage={() => Promise.resolve('blob:http://localhost/x')}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    }

    /**
     * Exhaustive by construction: `Record<DashboardModuleKey, string>` means
     * TypeScript refuses to compile once a new key is added to
     * `DashboardModuleKey` (in `dashboardModules.ts`) until this map gets a
     * corresponding entry, so a registered module cannot silently end up
     * without Today visibility coverage (#817 PO correction). The test
     * matrix below is then derived from `DASHBOARD_MODULE_KEYS`, the same
     * authoritative list Settings renders from, rather than a hand-written
     * key list of its own.
     */
    const MODULE_SECTION_MARKER: Record<DashboardModuleKey, string> = {
      relationship_presence: 'today-hero',
      upcoming: 'today-section-upcoming',
      keepsake: 'today-section-moment',
      relationship_signal: 'today-section-living',
      monthly_highlights: 'today-section-monthly',
      recent_shared: 'today-section-recent',
      shared_story_summary: 'shared-story-summary',
    };

    const MODULE_SECTIONS = DASHBOARD_MODULE_KEYS.map(
      (key) => [key, MODULE_SECTION_MARKER[key]] as const,
    );

    it('renders every registered module by default when no preference exists', () => {
      const html = renderWithVisibility({});

      for (const [, sectionClass] of MODULE_SECTIONS) {
        expect(html).toContain(sectionClass);
      }
      expect(html.indexOf('today-section-recent')).toBeLessThan(
        html.indexOf('shared-story-summary'),
      );
    });

    it.each(MODULE_SECTIONS)(
      'omits the %s section entirely when hidden, without a placeholder, while every other module stays visible',
      (moduleKey, sectionClass) => {
        const html = renderWithVisibility({ [moduleKey]: false });

        expect(html).not.toContain(sectionClass);
        for (const [otherKey, otherSectionClass] of MODULE_SECTIONS) {
          if (otherKey === moduleKey) continue;
          expect(html).toContain(otherSectionClass);
        }
      },
    );

    it.each(MODULE_SECTIONS)(
      'renders the %s section again once re-shown',
      (moduleKey, sectionClass) => {
        const hidden = renderWithVisibility({ [moduleKey]: false });
        expect(hidden).not.toContain(sectionClass);

        const shown = renderWithVisibility({ [moduleKey]: true });
        expect(shown).toContain(sectionClass);
      },
    );

    it('hiding one module does not change what another module selects (no duplicate content leaks in)', () => {
      const baseline = renderWithVisibility({});
      const withLivingHidden = renderWithVisibility({
        relationship_signal: false,
      });

      // The retrospective content stays claimed by `Gerade bei euch`'s
      // selection even while that section itself is not rendered - hiding it
      // must not let the same content reappear in `Diesen Monat` or the trace.
      expect(baseline).toContain('today-section-monthly');
      expect(withLivingHidden).not.toContain('today-living-retrospective');
      expect(withLivingHidden).toContain('today-section-monthly');
      expect(withLivingHidden).toContain('Monthly Photo');
      expect(withLivingHidden).not.toContain('Weisst du noch');
    });

    describe('relationship_presence (Couple Presence hero)', () => {
      it('hides the hero without an empty shell, replacing it with a valid page heading', () => {
        const shown = renderWithVisibility({});
        const hidden = renderWithVisibility({ relationship_presence: false });

        expect(shown).toContain('today-hero');
        expect(hidden).not.toContain('today-hero');

        // Exactly one <h1> either way: the real heading inside the hero, or
        // the quiet sr-only fallback that takes its place - never zero,
        // never two.
        const h1Count = (html: string) =>
          (html.match(/<h1[\s>]/g) ?? []).length;
        expect(h1Count(shown)).toBe(1);
        expect(h1Count(hidden)).toBe(1);
        expect(hidden).toContain('sr-only');
      });

      it('leaves every other module unaffected when the hero is hidden', () => {
        const hidden = renderWithVisibility({ relationship_presence: false });

        for (const [key, sectionClass] of MODULE_SECTIONS) {
          if (key === 'relationship_presence') continue;
          expect(hidden).toContain(sectionClass);
        }
      });
    });

    it('never flashes a persisted-hidden module while Dashboard preferences are still pending, even though Dashboard data already arrived', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClient.setQueryData(
        ['m5-s5', 'dashboard', 'space-1'],
        allModulesEligibleDashboard(),
      );
      // Deliberately NOT seeding dashboardPreferencesQueryKey: the query is
      // enabled (an account is supplied) but has neither resolved nor been
      // given cached data, so it is genuinely still pending - the exact race
      // the #817 PO correction flags (Dashboard data arrives first, the
      // independent preferences fetch is still in flight).
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TodayPage
              apis={{} as M4ProductApis}
              spaceId="space-1"
              account={{ id: 'account-1', displayName: 'Alex' }}
              loadMemoryImage={() => Promise.resolve('blob:http://localhost/x')}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Not one configurable module - hero included - renders as visible
      // content while the authoritative preference state is still unknown.
      for (const [, sectionClass] of MODULE_SECTIONS) {
        expect(html).not.toContain(sectionClass);
      }
      expect(html).toContain(de.states.loading.title);
    });
  });
});
