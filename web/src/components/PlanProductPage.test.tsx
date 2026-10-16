import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { PlanProductPage } from './PlanProductPage';

const CREATOR = { id: 'account-ben', displayName: 'Ben' };

function basePlan(overrides: Record<string, unknown> = {}) {
  return {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: new Date('2026-08-01T10:00:00Z'),
    createdBy: CREATOR.id,
    creator: CREATOR,
    description: null,
    experiencedOn: null,
    id: 'plan-1',
    placeId: null,
    plannedEnd: null,
    plannedStart: null,
    sourceWishId: null,
    spaceId: 'space-1',
    status: 'PLANNED',
    title: 'Picnic in the park',
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    version: 3,
    ...overrides,
  };
}

function renderPlan(plan: ReturnType<typeof basePlan>, places: unknown[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s3', 'plan', 'space-1', plan.id], plan);
  queryClient.setQueryData(
    authorSummaryQueryKeys.placeOptions('space-1'),
    places,
  );

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/plans/${plan.id}`]}>
        <Routes>
          <Route
            path="/plan/plans/:planId"
            element={
              <PlanProductPage
                apis={{} as SharedPlanningApis}
                spaceId="space-1"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PlanProductPage', () => {
  it('shows the title, readable schedule, resolved place, and creator attribution before operations', () => {
    const plan = basePlan({
      placeId: 'place-berlin',
      plannedStart: new Date('2026-09-14T14:00:00Z'),
    });
    const html = renderPlan(plan, [{ id: 'place-berlin', name: 'Volkspark' }]);

    expect(html).toContain('<h1');
    expect(html).toContain('Picnic in the park');
    expect(html).toContain('planen-detail-schedule');
    expect(html).not.toContain('planen-pill-scheduled');
    expect(html).toContain(
      i18n.t('m5s3.plan.placeLabel', { name: 'Volkspark' }),
    );
    expect(html).toContain(i18n.t('m5s3.overview.createdBy', { name: 'Ben' }));
  });

  it('presents a timed end as one range instead of a separate technical subfact', () => {
    const html = renderPlan(
      basePlan({
        plannedStart: new Date(2026, 8, 14, 14, 0),
        plannedEnd: new Date(2026, 8, 14, 16, 30),
      }),
    );

    expect(html).toContain('14:00–16:30');
    expect(html).not.toContain('planen-detail-subfacts');
  });

  it('presents an unscheduled Plan as a first-class undated intention', () => {
    const html = renderPlan(basePlan({ status: 'IDEA', plannedStart: null }));

    expect(html).toContain('planen-detail-schedule');
    expect(html).toContain(i18n.t('m5s3.overview.undatedHeading'));
    expect(html).not.toContain('planen-pill-idea');
  });

  it('shows the Notizen section only when a description exists', () => {
    const withNotes = renderPlan(
      basePlan({ description: 'Remember the sunscreen.' }),
    );
    expect(withNotes).toContain(i18n.t('m5s3.plan.notesHeading'));
    expect(withNotes).toContain('Remember the sunscreen.');

    const withoutNotes = renderPlan(basePlan({ description: null }));
    expect(withoutNotes).not.toContain(i18n.t('m5s3.plan.notesHeading'));
  });

  it('shows the shared-visibility note and the reachable lifecycle/complete controls for an active, editable Plan', () => {
    const html = renderPlan(basePlan());

    expect(html).toContain(i18n.t('m5s3.plan.sharedTitle'));
    expect(html).toContain(i18n.t('m5s3.plan.lifecycleHeading'));
    expect(html).toContain('planen-complete-cta');
    expect(html).toContain(i18n.t('m5s3.plan.complete'));
  });

  it('shows a completed Plan as a truthful read result without reopening capture automatically', () => {
    const html = renderPlan(
      basePlan({
        status: 'COMPLETED',
        experiencedOn: new Date('2026-09-14T00:00:00Z'),
      }),
    );

    expect(html).toContain(i18n.t('m5s3.plan.completedTitle'));
    expect(html).toContain(i18n.t('m5s3.plan.completedBody'));
    expect(html).not.toContain(i18n.t('m5s3.plan.sharedAchievementTitle'));
    expect(html).not.toContain(i18n.t('m5s3.planStory.memoryAction'));
    expect(html).not.toContain(i18n.t('m5s3.planStory.milestoneAction'));
    expect(html).not.toContain('planen-complete-cta');
    expect(html).not.toContain(i18n.t('m5s3.plan.lifecycleHeading'));
  });

  it('hides the edit action and lifecycle controls when the viewer lacks edit capability', () => {
    const html = renderPlan(
      basePlan({
        capabilities: { canComment: true, canDelete: false, canEdit: false },
      }),
    );

    expect(html).not.toContain(i18n.t('m5s3.plan.lifecycleHeading'));
    expect(html).not.toContain('planen-complete-cta');
  });
});
