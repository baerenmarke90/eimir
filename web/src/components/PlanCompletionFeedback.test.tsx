// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { formatCalendarDate } from '../client/formatRecency';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import de from '../i18n/locales/de';
import m5s3 from '../i18n/locales/m5s3';
import { PlanProductPage } from './PlanProductPage';

afterEach(cleanup);

const SPACE = 'space-1';
const OTHER_SPACE = 'space-2';
const PLAN_ID = 'plan-1';
const DAY = '2026-09-11';

const plan = (overrides: Partial<PlanDetail> = {}): PlanDetail =>
  ({
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: new Date('2026-08-01T10:00:00Z'),
    createdBy: 'account-ben',
    creator: { id: 'account-ben', displayName: 'Ben' },
    description: null,
    experiencedOn: null,
    id: PLAN_ID,
    placeId: null,
    plannedEnd: null,
    plannedStart: null,
    sourceWishId: null,
    spaceId: SPACE,
    status: 'PLANNED',
    title: 'Picnic in the park',
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    version: 3,
    ...overrides,
  }) as PlanDetail;

const completedPlan = () =>
  plan({
    status: 'COMPLETED',
    experiencedOn: new Date(`${DAY}T00:00:00Z`),
    version: 4,
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

type Completion = {
  value: () => Promise<PlanDetail>;
  raw: Response;
};

function confirmed(achievement = true): Completion {
  return {
    value: async () => completedPlan(),
    raw: new Response(null, {
      headers: achievement
        ? { 'X-Eimir-Shared-Achievement': 'plan-completed' }
        : {},
    }),
  };
}

function setup() {
  let server = plan();
  const writes: ReturnType<typeof deferred<Completion>>[] = [];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const key = authorSummaryQueryKeys.planDetail(SPACE, PLAN_ID);
  queryClient.setQueryData(key, server);
  const getPlan = vi.fn(async () => server);
  const completePlanRaw = vi.fn(() => {
    const write = deferred<Completion>();
    writes.push(write);
    return write.promise;
  });
  const scheduled = deferred<PlanDetail>();
  const schedulePlan = vi.fn(() => scheduled.promise);
  const apis = {
    plans: { getPlan, completePlanRaw, schedulePlan },
    places: {
      listPlaces: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        hasMore: false,
      })),
    },
  } as unknown as SharedPlanningApis;
  const tree = (spaceId = SPACE) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/plans/${PLAN_ID}`]}>
        <Routes>
          <Route
            path="/plan/plans/:planId"
            element={<PlanProductPage apis={apis} spaceId={spaceId} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    queryClient,
    key,
    writes,
    getPlan,
    completePlanRaw,
    schedulePlan,
    view,
    tree,
    setServer: (next: PlanDetail) => {
      server = next;
    },
  };
}

const completeButton = () =>
  screen.getByRole('button', {
    name: (name) => name === m5s3.plan.complete || name === m5s3.common.saving,
  });
const dateField = () => screen.getByLabelText(m5s3.plan.experiencedOn);
const pendingCopy = () =>
  m5s3.plan.completePending.replace(
    '{{date}}',
    formatCalendarDate(new Date(`${DAY}T00:00:00Z`)),
  );

async function openAndSubmit(h: ReturnType<typeof setup>) {
  await screen.findByText('Picnic in the park');
  fireEvent.change(dateField(), { target: { value: DAY } });
  fireEvent.submit(completeButton().closest('form') as HTMLFormElement);
  await waitFor(() => expect(h.completePlanRaw).toHaveBeenCalledTimes(1));
}

it('claims the completion synchronously, names the day in one status and locks competing writes without claiming success', async () => {
  const h = setup();
  await screen.findByText('Picnic in the park');
  fireEvent.change(dateField(), { target: { value: DAY } });
  const form = completeButton().closest('form') as HTMLFormElement;
  fireEvent.submit(form);
  fireEvent.submit(form);
  fireEvent.click(completeButton());
  await waitFor(() => expect(h.completePlanRaw).toHaveBeenCalledTimes(1));
  expect(h.completePlanRaw.mock.calls[0]).toMatchObject([
    {
      spaceId: SPACE,
      planId: PLAN_ID,
      ifMatch: '3',
      planComplete: { experiencedOn: new Date(`${DAY}T00:00:00Z`) },
    },
  ]);

  const status = await screen.findByRole('status');
  expect(status.textContent).toBe(pendingCopy());
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(completeButton().getAttribute('aria-disabled')).toBe('true');
  expect(completeButton().textContent).toBe(m5s3.common.saving);
  expect((dateField() as HTMLInputElement).readOnly).toBe(true);
  expect((dateField() as HTMLInputElement).value).toBe(DAY);
  for (const name of [
    m5s3.plan.reschedule,
    m5s3.plan.unschedule,
    de.common.edit,
  ]) {
    expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(
      true,
    );
  }
  expect(
    screen.getByLabelText(m5s3.plan.plannedDate).closest('fieldset')?.disabled,
  ).toBe(true);

  // Nothing is claimed before the server answers.
  expect(screen.queryByText(m5s3.plan.completedTitle)).toBeNull();
  expect(screen.queryByText(m5s3.plan.sharedAchievementTitle)).toBeNull();
  expect(screen.queryByText(m5s3.planStory.memoryAction)).toBeNull();
  expect(h.queryClient.getQueryData<PlanDetail>(h.key)?.status).toBe('PLANNED');
});

it('confirms from the authoritative response, announces the achievement only when the server does and removes pending state', async () => {
  const h = setup();
  await openAndSubmit(h);
  h.setServer(completedPlan());
  await act(async () => h.writes[0].resolve(confirmed(true)));

  expect(
    await screen.findByRole('heading', {
      name: m5s3.plan.sharedAchievementTitle,
    }),
  ).toBeDefined();
  expect(
    screen.getByRole('button', { name: m5s3.planStory.memoryAction }),
  ).toBeDefined();
  expect(screen.queryByText(pendingCopy())).toBeNull();
  expect(h.queryClient.getQueryData<PlanDetail>(h.key)?.status).toBe(
    'COMPLETED',
  );
  expect(h.completePlanRaw).toHaveBeenCalledTimes(1);
});

it('shows the plain confirmed continuation when the server sends no achievement header', async () => {
  const h = setup();
  await openAndSubmit(h);
  h.setServer(completedPlan());
  await act(async () => h.writes[0].resolve(confirmed(false)));

  expect(
    await screen.findByRole('heading', { name: m5s3.plan.completedTitle }),
  ).toBeDefined();
  expect(screen.queryByText(m5s3.plan.sharedAchievementTitle)).toBeNull();
});

it('keeps the pending status through a background read and never snaps back to a stale plan', async () => {
  const h = setup();
  await openAndSubmit(h);
  await act(async () =>
    h.queryClient.invalidateQueries({ queryKey: h.key, exact: true }),
  );
  expect(screen.getByRole('status').textContent).toBe(pendingCopy());
  expect(completeButton().getAttribute('aria-disabled')).toBe('true');
  expect(h.completePlanRaw).toHaveBeenCalledTimes(1);
});

it('removes the status on failure, keeps the entered day and only retries after a deliberate action', async () => {
  const h = setup();
  await openAndSubmit(h);
  await act(async () =>
    h.writes[0].reject(new ClientProblemError('server', 500, 'FAILED')),
  );

  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(screen.getByText(de.states.server.title)).toBeDefined();
  expect((dateField() as HTMLInputElement).value).toBe(DAY);
  expect(completeButton().getAttribute('aria-disabled')).toBe('false');
  expect(screen.queryByText(m5s3.plan.completedTitle)).toBeNull();
  expect(h.completePlanRaw).toHaveBeenCalledTimes(1);

  fireEvent.submit(completeButton().closest('form') as HTMLFormElement);
  await waitFor(() => expect(h.completePlanRaw).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(de.states.server.title)).toBeNull();
  expect(screen.getByRole('status').textContent).toBe(pendingCopy());
});

it('recovers a conflict from a fresh read without replaying the stale version', async () => {
  const h = setup();
  await openAndSubmit(h);
  const reads = h.getPlan.mock.calls.length;
  h.setServer(completedPlan());
  await act(async () =>
    h.writes[0].reject(new ClientProblemError('conflict', 409, 'CONFLICT')),
  );

  await waitFor(() => expect(h.getPlan.mock.calls.length).toBe(reads + 1));
  // Another member completed it: the confirmed result, no celebration.
  expect(await screen.findByText(m5s3.plan.completedBody)).toBeDefined();
  expect(screen.queryByText(m5s3.plan.sharedAchievementTitle)).toBeNull();
  expect(
    screen.queryByRole('button', { name: m5s3.planStory.memoryAction }),
  ).toBeNull();
  expect(h.completePlanRaw).toHaveBeenCalledTimes(1);
});

it('keeps competing writes locked until a conflict recovery read returns the current version', async () => {
  const h = setup();
  await openAndSubmit(h);
  const read = deferred<PlanDetail>();
  h.getPlan.mockImplementation(() => read.promise);
  await act(async () =>
    h.writes[0].reject(new ClientProblemError('conflict', 409, 'CONFLICT')),
  );
  await waitFor(() => expect(h.getPlan).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(pendingCopy())).toBeNull();
  expect(screen.getByText(de.states.conflict.title)).toBeDefined();

  expect(completeButton().getAttribute('aria-disabled')).toBe('true');
  expect(
    screen
      .getByRole('button', { name: m5s3.plan.reschedule })
      .hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.submit(completeButton().closest('form') as HTMLFormElement);
  expect(h.completePlanRaw).toHaveBeenCalledTimes(1);

  const recovered = plan({ version: 5 });
  await act(async () => read.resolve(recovered));
  await waitFor(() =>
    expect(completeButton().getAttribute('aria-disabled')).toBe('false'),
  );
  fireEvent.submit(completeButton().closest('form') as HTMLFormElement);
  await waitFor(() => expect(h.completePlanRaw).toHaveBeenCalledTimes(2));
  expect(h.completePlanRaw.mock.calls[1]).toMatchObject([{ ifMatch: '5' }]);
});

it.each(['completion', 'schedule'])(
  'blocks a competing write in the same task when %s is submitted first',
  async (first) => {
    const h = setup();
    await screen.findByText('Picnic in the park');
    fireEvent.change(dateField(), { target: { value: DAY } });
    const scheduleDate = screen.getByLabelText(m5s3.plan.plannedDate);
    fireEvent.change(scheduleDate, { target: { value: DAY } });
    const completeForm = completeButton().closest('form') as HTMLFormElement;
    const scheduleForm = scheduleDate.closest('form') as HTMLFormElement;
    const forms =
      first === 'completion'
        ? [completeForm, scheduleForm]
        : [scheduleForm, completeForm];

    act(() => {
      for (const form of forms) {
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      }
    });
    await waitFor(() =>
      expect(
        h.completePlanRaw.mock.calls.length + h.schedulePlan.mock.calls.length,
      ).toBe(1),
    );
    expect(h.completePlanRaw).toHaveBeenCalledTimes(
      first === 'completion' ? 1 : 0,
    );
    expect(h.schedulePlan).toHaveBeenCalledTimes(first === 'schedule' ? 1 : 0);
  },
);

it('does not celebrate a late completion after the initiating cache is replaced in the same Space', async () => {
  const h = setup();
  await openAndSubmit(h);
  act(() => {
    h.queryClient.clear();
    h.queryClient.setQueryData(h.key, completedPlan());
  });
  h.view.rerender(h.tree());
  expect(await screen.findByText(m5s3.plan.completedBody)).toBeDefined();
  await act(async () => h.writes[0].resolve(confirmed(true)));
  expect(screen.queryByText(m5s3.plan.sharedAchievementTitle)).toBeNull();
  expect(screen.getByText(m5s3.plan.completedBody)).toBeDefined();
});

it('keeps pending state and the duplicate guard across a remount', async () => {
  const h = setup();
  await openAndSubmit(h);
  h.view.unmount();
  render(h.tree());

  expect((await screen.findByRole('status')).textContent).toBe(pendingCopy());
  expect(completeButton().getAttribute('aria-disabled')).toBe('true');
  fireEvent.submit(completeButton().closest('form') as HTMLFormElement);
  expect(h.completePlanRaw).toHaveBeenCalledTimes(1);
});

it('reconciles a late response for an unmounted page without showing a celebration', async () => {
  const h = setup();
  await openAndSubmit(h);
  h.view.unmount();
  h.setServer(completedPlan());
  await act(async () => h.writes[0].resolve(confirmed(true)));

  expect(h.queryClient.getQueryData<PlanDetail>(h.key)?.status).toBe(
    'COMPLETED',
  );
  render(h.tree());
  expect(await screen.findByText(m5s3.plan.completedBody)).toBeDefined();
  expect(screen.queryByText(m5s3.plan.sharedAchievementTitle)).toBeNull();
});

it('does not leak pending state into another Space or recreate the cleared Space cache', async () => {
  const h = setup();
  await openAndSubmit(h);
  const otherKey = authorSummaryQueryKeys.planDetail(OTHER_SPACE, PLAN_ID);
  h.queryClient.setQueryData(otherKey, plan({ spaceId: OTHER_SPACE }));
  // The app clears all caches when the Space changes.
  h.queryClient.clear();
  h.queryClient.setQueryData(otherKey, plan({ spaceId: OTHER_SPACE }));
  h.view.rerender(h.tree(OTHER_SPACE));

  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  await screen.findByText('Picnic in the park');
  expect(completeButton().getAttribute('aria-disabled')).toBe('false');
  expect(
    screen
      .getByRole('button', { name: m5s3.plan.reschedule })
      .hasAttribute('disabled'),
  ).toBe(false);

  h.setServer(completedPlan());
  await act(async () => h.writes[0].resolve(confirmed(true)));
  expect(h.queryClient.getQueryData(h.key)).toBeUndefined();
  expect(screen.queryByText(m5s3.plan.sharedAchievementTitle)).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});
