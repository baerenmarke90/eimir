// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  HEART_MOMENT_CREATE_ROUTE,
  MEMORY_CREATE_ROUTE,
  MILESTONE_CREATE_ROUTE,
} from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { PlanProductPage } from './PlanProductPage';

const t = i18n.t.bind(i18n);
const CAPTURE_LABELS = [
  'm5s3.planStory.menuMemory',
  'm5s3.planStory.menuHeartMoment',
  'm5s3.planStory.menuMilestone',
] as const;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

function CaptureProbe() {
  const location = useLocation();
  return (
    <output aria-label="capture">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </output>
  );
}

function renderPlan(overrides: Partial<PlanDetail> = {}) {
  const plan: PlanDetail = {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: new Date('2026-08-01T10:00:00Z'),
    createdBy: 'account-ben',
    creator: { id: 'account-ben', displayName: 'Ben' },
    description: 'Remember the blanket.',
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
    ...overrides,
  };
  const apis = {
    plans: {
      getPlan: vi.fn(async () => plan),
      listPlanCollections: vi.fn(async () => []),
      listPlanNotes: vi.fn(async () => []),
      listPlanStory: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        hasMore: false,
      })),
    },
    places: {
      listPlaces: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  } as unknown as SharedPlanningApis;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.planDetail('space-1', plan.id),
    plan,
  );
  queryClient.setQueryData(authorSummaryQueryKeys.placeOptions('space-1'), []);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/plans/${plan.id}`]}>
        <Routes>
          <Route
            path="/plan/plans/:planId"
            element={
              <PlanProductPage
                apis={apis}
                spaceId="space-1"
                accountId="account-anna"
                apiBaseUrl="https://eimir.example"
              />
            }
          />
          {[
            MEMORY_CREATE_ROUTE,
            HEART_MOMENT_CREATE_ROUTE,
            MILESTONE_CREATE_ROUTE,
          ].map((path) => (
            <Route key={path} path={path} element={<CaptureProbe />} />
          ))}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return plan;
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: t('m5s3.plan.menu') }));
}

const captureOption = (key: (typeof CAPTURE_LABELS)[number]) =>
  screen.queryByRole('button', { name: t(key) });

describe('PlanProductPage capture as a Moment (#2158)', () => {
  it('offers every Moment kind in the menu of a completed editable Plan', async () => {
    renderPlan();
    openMenu();
    await screen.findByRole('button', { name: t('common.edit') });
    for (const key of CAPTURE_LABELS) expect(captureOption(key)).not.toBeNull();
    // Not only right after completing: the page shows no continuation.
    expect(
      screen.queryByRole('button', { name: t('m5s3.planStory.memoryAction') }),
    ).toBeNull();
  });

  it.each([
    ['m5s3.planStory.menuMemory', MEMORY_CREATE_ROUTE],
    ['m5s3.planStory.menuHeartMoment', HEART_MOMENT_CREATE_ROUTE],
    ['m5s3.planStory.menuMilestone', MILESTONE_CREATE_ROUTE],
  ] as const)(
    '%s opens the canonical capture with the Plan as its source',
    async (key, route) => {
      renderPlan();
      openMenu();
      fireEvent.click(await screen.findByRole('button', { name: t(key) }));
      const probe = await screen.findByLabelText('capture');
      const target = JSON.parse(probe.textContent ?? '{}') as {
        path: string;
        state: Record<string, unknown>;
      };
      expect(target.path).toBe(route);
      // The same handoff as the completion continuation: prefill and link.
      expect(target.state).toEqual(
        expect.objectContaining({
          sourcePlan: {
            id: 'plan-1',
            spaceId: 'space-1',
            accountId: 'account-anna',
            instance: 'https://eimir.example',
          },
        }),
      );
      expect(target.state).toHaveProperty('taskOriginKey');
    },
  );

  it('is not offered for a Plan that is not completed', async () => {
    renderPlan({ status: 'PLANNED', experiencedOn: null });
    openMenu();
    await screen.findByRole('button', { name: t('common.edit') });
    for (const key of CAPTURE_LABELS) expect(captureOption(key)).toBeNull();
  });

  it('is not offered to a viewer who cannot edit the Plan', async () => {
    renderPlan({
      capabilities: { canComment: true, canDelete: true, canEdit: false },
    });
    openMenu();
    await screen.findByRole('button', { name: t('common.delete') });
    expect(screen.queryByRole('button', { name: t('common.edit') })).toBeNull();
    for (const key of CAPTURE_LABELS) expect(captureOption(key)).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('.item-menu')).not.toBeNull(),
    );
  });
});
