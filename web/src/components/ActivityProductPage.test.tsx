import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityApi } from '../api/generated/apis/ActivityApi';
import type { M4ProductApis } from '../client/m4Product';
import m5s5 from '../i18n/locales/m5s5';
import { ActivityProductPage } from './M4ProductPages';

const SPACE_ID = 'space-1';

function renderActivityPage(
  items: unknown[],
  currentAccountId?: string,
): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'activity', SPACE_ID], {
    pages: [
      {
        items,
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ActivityProductPage
          apis={{ activity: {} as ActivityApi } as M4ProductApis}
          spaceId={SPACE_ID}
          currentAccountId={currentAccountId}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('issue #501: Activity relationship chronology presentation', () => {
  it('renders "Du" and second-person phrasing when actor is current account', () => {
    const html = renderActivityPage(
      [
        {
          id: 'act-1',
          sourceEventId: 'evt-1',
          kind: 'MEMORY_CREATED',
          actorId: 'user-self',
          actor: {
            id: 'user-self',
            displayName: 'Alex',
            profileAttachmentId: null,
          },
          targetType: 'MEMORY',
          targetId: 'mem-1',
          target: {
            targetType: 'MEMORY',
            targetId: 'mem-1',
            title: 'Summer vacation at the lake',
          },
          occurredAt: new Date('2026-08-20T14:30:00Z'),
          createdAt: new Date('2026-08-20T14:30:00Z'),
        },
      ],
      'user-self',
    );

    // Own Actor Presentation ("Du")
    expect(html).toContain(m5s5.activity.you);
    expect(html).toContain(m5s5.activityActionOwn.MEMORY_CREATED);
    expect(html).not.toContain('Alex');
    // Target Presentation
    expect(html).toContain('Summer vacation at the lake');
    // Deep Link Navigation
    expect(html).toContain('href="/story/memories/mem-1"');
  });

  it('renders partner display name and third-person phrasing when actor is partner', () => {
    const html = renderActivityPage(
      [
        {
          id: 'act-2',
          sourceEventId: 'evt-2',
          kind: 'HEART_MOMENT_CREATED',
          actorId: 'user-partner',
          actor: {
            id: 'user-partner',
            displayName: 'Ben',
            profileAttachmentId: null,
          },
          targetType: 'HEART_MOMENT',
          targetId: 'heart-1',
          target: {
            targetType: 'HEART_MOMENT',
            targetId: 'heart-1',
            title: 'You make me smile every day',
          },
          occurredAt: new Date('2026-08-21T10:00:00Z'),
          createdAt: new Date('2026-08-21T10:00:00Z'),
        },
      ],
      'user-self',
    );

    expect(html).toContain('Ben');
    expect(html).toContain(m5s5.activityAction.HEART_MOMENT_CREATED);
    expect(html).not.toContain(m5s5.activity.you);
    expect(html).toContain('You make me smile every day');
    expect(html).toContain('href="/story/heart-moments/heart-1"');
  });

  it('renders neutral system formulation when actor is null', () => {
    const html = renderActivityPage(
      [
        {
          id: 'act-3',
          sourceEventId: 'evt-3',
          kind: 'PLAN_CREATED',
          actorId: null,
          actor: null,
          targetType: 'PLAN',
          targetId: 'plan-1',
          target: {
            targetType: 'PLAN',
            targetId: 'plan-1',
            title: 'Weekend getaway',
          },
          occurredAt: new Date('2026-08-22T10:00:00Z'),
          createdAt: new Date('2026-08-22T10:00:00Z'),
        },
      ],
      'user-self',
    );

    expect(html).toContain(m5s5.activityKind.PLAN_CREATED);
    expect(html).not.toContain(m5s5.activity.you);
    expect(html).toContain('Weekend getaway');
    expect(html).toContain('href="/plan/plans/plan-1"');
    expect(html).toContain('activity-card-chevron');
  });

  it('renders static non-interactive card when target is null', () => {
    const html = renderActivityPage(
      [
        {
          id: 'act-4',
          sourceEventId: 'evt-4',
          kind: 'PLAN_CREATED',
          actorId: null,
          actor: null,
          targetType: null,
          targetId: null,
          target: null,
          occurredAt: new Date('2026-08-22T10:00:00Z'),
          createdAt: new Date('2026-08-22T10:00:00Z'),
        },
      ],
      'user-self',
    );
    expect(html).toContain('activity-card-static');
    expect(html).not.toContain('activity-card-chevron');
    expect(html).not.toContain('activity-result-link');
  });

  it('renders empty state when no activities exist', () => {
    const html = renderActivityPage([]);
    expect(html).toContain(m5s5.activity.emptyTitle);
  });
});
