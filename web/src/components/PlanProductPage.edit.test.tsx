// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import {
  type PlanUpdate,
  PlanUpdateToJSON,
} from '../api/generated/models/PlanUpdate';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { ClientProblemError } from '../client/problemDetails';
import { PlanProductPage } from './PlanProductPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

function renderEditor(
  status: PlanDetail['status'],
  places: { id: string; name: string }[] = [],
) {
  const plan: PlanDetail = {
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: new Date('2026-08-01T10:00:00Z'),
    createdBy: 'account-ben',
    creator: { id: 'account-ben', displayName: 'Ben' },
    description: 'Original note',
    experiencedOn:
      status === 'COMPLETED' ? new Date('2026-10-20T00:00:00Z') : null,
    id: 'plan-1',
    placeId: null,
    plannedEnd: null,
    plannedOn: null,
    plannedStart:
      status === 'PLANNED' ? new Date('2026-11-21T21:00:00Z') : null,
    sourceWishId: null,
    spaceId: 'space-1',
    status,
    title: 'Evening together',
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    version: 3,
  };
  let saved = plan;
  const requestBodies: Record<string, unknown>[] = [];
  const updatePlan = vi.fn(
    async ({ planUpdate }: { planUpdate: PlanUpdate }) => {
      // Match the generated HTTP client's serialization. An invalid Date throws
      // before any PATCH request can be sent.
      requestBodies.push(
        JSON.parse(JSON.stringify(PlanUpdateToJSON(planUpdate))) as Record<
          string,
          unknown
        >,
      );
      saved = {
        ...plan,
        description: planUpdate.description ?? null,
        version: 4,
      };
      return saved;
    },
  );
  const apis = {
    plans: {
      getPlan: vi.fn(async () => saved),
      listPlanCollections: vi.fn(async () => []),
      listPlanStory: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        hasMore: false,
      })),
      updatePlan,
    },
    places: {
      listPlaces: vi.fn(async () => ({ items: places, nextCursor: null })),
    },
  } as unknown as SharedPlanningApis;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.planDetail('space-1', plan.id),
    plan,
  );
  queryClient.setQueryData(
    authorSummaryQueryKeys.placeOptions('space-1'),
    places,
  );

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/plans/${plan.id}`]}>
        <Routes>
          <Route
            path="/plan/plans/:planId"
            element={<PlanProductPage apis={apis} spaceId="space-1" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return {
    requestBodies,
    updatePlan,
    queryClient,
    plan,
    setServer: (next: PlanDetail) => {
      saved = next;
    },
  };
}

async function editDescription() {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('common.edit') }));
  fireEvent.change(
    screen.getByRole('textbox', {
      name: i18n.t('m5s3.common.description'),
    }),
    { target: { value: 'Updated note' } },
  );
}

async function saveEdit() {
  fireEvent.click(
    screen.getByRole('button', {
      name: i18n.t('m5s3.common.saveChanges'),
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('button', {
        name: i18n.t('m5s3.common.saveChanges'),
      }),
    ).toBeNull(),
  );
  expect(screen.getByText('Updated note')).toBeTruthy();
}

describe('PlanProductPage editor request serialization', () => {
  it.each(['IDEA', 'PLANNED'] as const)(
    'saves an edited %s Plan without manufacturing a completion date',
    async (status) => {
      const { requestBodies, updatePlan } = renderEditor(status);
      await editDescription();
      await saveEdit();

      expect(updatePlan).toHaveBeenCalledTimes(1);
      expect(requestBodies).toEqual([
        {
          description: 'Updated note',
          placeId: null,
          title: 'Evening together',
          tags: [],
          anticipationEnabled: false,
          schedule:
            status === 'PLANNED'
              ? { plannedStart: '2026-11-21T21:00:00.000Z' }
              : null,
        },
      ]);
    },
  );

  it('keeps an explicitly edited completion date for a completed Plan', async () => {
    const { requestBodies } = renderEditor('COMPLETED');
    await editDescription();
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(i18n.t('m5s3.plan.experiencedOn')),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(i18n.t('m5s3.plan.experiencedOn'), {
        selector: 'input',
      }),
      {
        target: { value: '2026-10-18' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('experiences.finish') }),
    );
    await saveEdit();

    expect(requestBodies).toEqual([
      {
        description: 'Updated note',
        experiencedOn: '2026-10-18',
        placeId: null,
        title: 'Evening together',
        tags: [],
        anticipationEnabled: false,
      },
    ]);
  });
});

it('keeps the activating Edit button separate from the new native-submit control', async () => {
  const h = renderEditor('IDEA');
  const edit = screen.getByRole('button', {
    name: i18n.t('common.edit'),
  }) as HTMLButtonElement;
  fireEvent.click(edit);
  await screen.findByRole('button', {
    name: i18n.t('m5s3.common.saveChanges'),
  });
  // Native click default activation runs after React's discrete event update.
  // The initiating read action must not become a submit control mid-click.
  expect(edit.type).toBe('button');
  expect(edit.form).toBeNull();
  expect(h.updatePlan).not.toHaveBeenCalled();
});

it('releases the parent pending guard after choosing a Place and saves the staged location', async () => {
  const h = renderEditor('IDEA', [{ id: 'river', name: 'Riverside' }]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('common.edit') }));
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('composer.place') }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Riverside' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const save = screen.getByRole('button', {
    name: i18n.t('m5s3.common.saveChanges'),
  });
  expect(save.hasAttribute('disabled')).toBe(false);
  fireEvent.click(save);
  await waitFor(() => expect(h.updatePlan).toHaveBeenCalledTimes(1));
  expect(h.requestBodies[0]).toMatchObject({ placeId: 'river' });
});

it('keeps the initiating version during background reads and rebases only on deliberate retry without losing the draft', async () => {
  const h = renderEditor('PLANNED');
  h.updatePlan.mockRejectedValueOnce(
    new ClientProblemError('conflict', 409, 'CONFLICT'),
  );
  await editDescription();
  fireEvent.click(
    screen.getByRole('button', {
      name: new RegExp(i18n.t('m5s3.plan.schedule')),
    }),
  );
  fireEvent.change(screen.getByLabelText(i18n.t('m5s3.plan.plannedDate')), {
    target: { value: '2026-12-12' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('experiences.finish') }),
  );
  const latest = { ...h.plan, title: 'Partner correction', version: 4 };
  h.setServer(latest);
  act(() =>
    h.queryClient.setQueryData(
      authorSummaryQueryKeys.planDetail('space-1', h.plan.id),
      latest,
    ),
  );
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
  );
  await screen.findByText(i18n.t('states.conflict.title'));
  expect(h.updatePlan.mock.calls[0][0]).toMatchObject({ ifMatch: '3' });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('common.retry') }));
  await waitFor(() =>
    expect(
      h.queryClient.getQueryState(
        authorSummaryQueryKeys.planDetail('space-1', h.plan.id),
      )?.fetchStatus,
    ).toBe('idle'),
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: new RegExp(i18n.t('m5s3.plan.schedule')),
    }),
  );
  expect(
    (screen.getByLabelText(i18n.t('m5s3.plan.plannedDate')) as HTMLInputElement)
      .value,
  ).toBe('2026-12-12');
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('experiences.finish') }),
  );
  expect(
    (
      screen.getByLabelText(
        i18n.t('m5s3.common.description'),
      ) as HTMLTextAreaElement
    ).value,
  ).toBe('Updated note');
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
  );
  await waitFor(() => expect(h.updatePlan).toHaveBeenCalledTimes(2));
  expect(h.updatePlan.mock.calls[1][0]).toMatchObject({
    ifMatch: '4',
    planUpdate: { description: 'Updated note' },
  });
});
