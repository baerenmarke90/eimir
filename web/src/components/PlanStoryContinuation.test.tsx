// @vitest-environment jsdom
import '../i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { MEMORY_CREATE_ROUTE, MILESTONE_CREATE_ROUTE } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { PlanStoryContinuation } from './PlanStoryContinuation';

const plan: PlanDetail = {
  capabilities: { canComment: true, canDelete: true, canEdit: true },
  createdAt: new Date('2026-08-01T10:00:00Z'),
  createdBy: 'account-1',
  creator: { id: 'account-1', displayName: 'Lea' },
  description: 'Bring the picnic blanket.',
  experiencedOn: new Date('2026-09-14T00:00:00Z'),
  id: 'plan-1',
  placeId: null,
  plannedEnd: null,
  plannedOn: null,
  plannedStart: null,
  sourceWishId: null,
  spaceId: 'space-1',
  status: 'COMPLETED',
  title: 'Picnic in the park',
  updatedAt: new Date('2026-09-14T16:00:00Z'),
  version: 4,
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}</output>;
}

function renderContinuation(sharedAchievementEnabled = false) {
  return render(
    <MemoryRouter initialEntries={['/plan/plans/plan-1']}>
      <PlanStoryContinuation
        apis={{} as SharedPlanningApis}
        spaceId="space-1"
        plan={plan}
        sharedAchievementEnabled={sharedAchievementEnabled}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('PlanStoryContinuation', () => {
  it('renders exactly one team celebration when the Space module is enabled', () => {
    const view = renderContinuation(true);

    expect(
      screen.getAllByRole('heading', {
        name: i18n.t('m5s3.plan.sharedAchievementTitle'),
      }),
    ).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain(
      i18n.t('m5s3.plan.sharedAchievementBody', { title: plan.title }),
    );
    expect(
      screen.queryByRole('heading', {
        name: i18n.t('m5s3.plan.completedTitle'),
      }),
    ).toBeNull();

    view.rerender(
      <MemoryRouter initialEntries={['/plan/plans/plan-1']}>
        <PlanStoryContinuation
          apis={{} as SharedPlanningApis}
          spaceId="space-1"
          plan={plan}
          sharedAchievementEnabled
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      screen.getAllByRole('heading', {
        name: i18n.t('m5s3.plan.sharedAchievementTitle'),
      }),
    ).toHaveLength(1);
  });

  it('hands Memory capture to the canonical R1 route without rendering a second editor', () => {
    renderContinuation();

    expect(screen.queryByLabelText(i18n.t('m5s3.common.title'))).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.planStory.memoryAction'),
      }),
    );
    expect(screen.getByLabelText('location').textContent).toBe(
      MEMORY_CREATE_ROUTE,
    );
  });

  it('keeps the supported Milestone continuation secondary and canonical', () => {
    renderContinuation();

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.planStory.milestoneAction'),
      }),
    );
    expect(screen.getByLabelText('location').textContent).toBe(
      MILESTONE_CREATE_ROUTE,
    );
  });

  it('allows the optional continuation to be skipped after completion', () => {
    renderContinuation();

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.planStory.later') }),
    );
    expect(
      screen.queryByRole('heading', {
        name: i18n.t('m5s3.plan.completedTitle'),
      }),
    ).toBeNull();
    expect(screen.getByLabelText('location').textContent).toBe(
      '/plan/plans/plan-1',
    );
  });
});
