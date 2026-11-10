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
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import m5s3 from '../i18n/locales/m5s3';
import taskBoundary from '../i18n/locales/taskBoundary';
import { i18n } from '../i18n';
import { PlanningCreatePage } from './PlanningCreatePage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

function renderCreate(
  kind: 'plan' | 'wish',
  overrides: Partial<SharedPlanningApis> = {},
) {
  const createPlan = vi.fn().mockResolvedValue({ id: 'plan-created' });
  const createWish = vi.fn().mockResolvedValue({ id: 'wish-created' });
  const listPlaces = vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  const apis = {
    plans: { createPlan },
    wishes: { createWish },
    places: { listPlaces },
    ...overrides,
  } as SharedPlanningApis;
  const locations: string[] = [];
  const Tracker = () => {
    const location = useLocation();
    locations.push(location.pathname);
    return null;
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          kind === 'plan' ? '/plan/plans/new' : '/plan/wishes/new',
        ]}
      >
        <Tracker />
        <Routes>
          <Route
            path="/plan/plans/new"
            element={
              <PlanningCreatePage kind="plan" apis={apis} spaceId="space-1" />
            }
          />
          <Route
            path="/plan/wishes/new"
            element={
              <PlanningCreatePage kind="wish" apis={apis} spaceId="space-1" />
            }
          />
          <Route path="/plan/plans/:planId" element={<p>Plan result</p>} />
          <Route path="/plan/wishes/:wishId" element={<p>Wish result</p>} />
          <Route path="/plan" element={<p>Planning overview</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { createPlan, createWish, locations, unmount };
}

describe('PlanningCreatePage', () => {
  it('keeps the confirmed Plan after list-link failure and retries without creating a second Plan', async () => {
    const link = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValue(undefined);
    const collection = { id: 'list-a', title: 'Lake picnic', items: [] };
    const createPlan = vi.fn().mockResolvedValue({ id: 'saved-plan' });
    renderCreate('plan', {
      plans: {
        createPlan,
        linkPlanCollection: link,
      } as unknown as SharedPlanningApis['plans'],
      collections: {
        listCollections: vi
          .fn()
          .mockResolvedValue({ items: [collection], nextCursor: null }),
      } as unknown as SharedPlanningApis['collections'],
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: m5s3.plan.intentionLabel }),
      { target: { value: 'A picnic together' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('composer.list') }),
    );
    fireEvent.click(
      await within(await screen.findByRole('dialog')).findByRole('checkbox'),
    );
    fireEvent.click(screen.getByRole('button', { name: m5s3.collection.link }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: m5s3.common.save,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: m5s3.common.save }));
    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    await screen.findByText(m5s3.collection.planSavedLinkFailed);
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    await screen.findByText('Plan result');
    expect(link).toHaveBeenCalledTimes(2);
    expect(createPlan).toHaveBeenCalledTimes(1);
  });
  it('omits redundant fixed-audience banners from Plan and Wish creation', () => {
    const { unmount } = renderCreate('wish');

    expect(screen.queryByText(m5s3.wish.sharedBody)).toBeNull();
    expect(screen.queryByText(m5s3.plan.sharedBody)).toBeNull();

    unmount();
    renderCreate('plan');

    expect(screen.queryByText(m5s3.plan.sharedBody)).toBeNull();
    expect(screen.queryByText(m5s3.wish.sharedBody)).toBeNull();
  });

  it('creates a valid undated Plan and opens the canonical result', async () => {
    const { createPlan, locations } = renderCreate('plan');
    const title = screen.getByLabelText(m5s3.plan.intentionLabel);

    expect(document.activeElement).not.toBe(title);
    fireEvent.change(title, { target: { value: 'Park picnic' } });
    fireEvent.click(screen.getByRole('button', { name: m5s3.common.save }));

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(createPlan).toHaveBeenCalledWith({
      spaceId: 'space-1',
      idempotencyKey: expect.any(String),
      planCreate: {
        title: 'Park picnic',
        tags: [],
        description: undefined,
        placeId: undefined,
        schedule: undefined,
      },
    });
    await waitFor(() =>
      expect(locations.at(-1)).toBe('/plan/plans/plan-created'),
    );
  });

  it('preserves date-only schedule semantics in compact context', async () => {
    const { createPlan } = renderCreate('plan');
    fireEvent.change(screen.getByLabelText(m5s3.plan.intentionLabel), {
      target: { value: 'Day trip' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(m5s3.plan.schedule) }),
    );
    fireEvent.change(screen.getByLabelText(m5s3.plan.plannedDate), {
      target: { value: '2026-10-03' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('experiences.finish') }),
    );
    fireEvent.click(screen.getByRole('button', { name: m5s3.common.save }));

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    const request = createPlan.mock.calls[0]?.[0];
    expect(request.planCreate.schedule).toEqual({
      plannedOn: new Date('2026-10-03T00:00:00Z'),
    });
  });

  it('keeps the chosen end time when compact scheduling is closed before Save', async () => {
    const { createPlan } = renderCreate('plan');
    fireEvent.change(screen.getByLabelText(m5s3.plan.intentionLabel), {
      target: { value: 'Evening walk' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(m5s3.plan.schedule) }),
    );
    fireEvent.change(screen.getByLabelText(m5s3.plan.plannedDate), {
      target: { value: '2026-10-03' },
    });
    fireEvent.change(screen.getByLabelText(m5s3.plan.plannedStartTime), {
      target: { value: '18:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: m5s3.plan.addEndTime }));
    fireEvent.change(screen.getByLabelText(m5s3.plan.endTime), {
      target: { value: '19:30' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('experiences.finish') }),
    );
    fireEvent.click(screen.getByRole('button', { name: m5s3.common.save }));
    await waitFor(() => expect(createPlan).toHaveBeenCalledOnce());
    const schedule = createPlan.mock.calls[0][0].planCreate.schedule;
    expect(schedule.plannedStart.getHours()).toBe(18);
    expect(schedule.plannedEnd.getHours()).toBe(19);
    expect(schedule.plannedEnd.getMinutes()).toBe(30);
  });

  it('stages a Wish before creation and retries its association without creating another Plan', async () => {
    const wish = { id: 'wish-source', title: 'A lakeside picnic', version: 2 };
    const parent = { id: 'saved-plan', sourceWishId: null, version: 3 };
    const createPlan = vi.fn().mockResolvedValue(parent);
    const getPlan = vi.fn().mockResolvedValue({ ...parent, version: 4 });
    const linkWishToPlan = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValue({
        plan: { ...parent, sourceWishId: wish.id, version: 5 },
        wish,
      });
    renderCreate('plan', {
      plans: {
        createPlan,
        getPlan,
        linkWishToPlan,
      } as unknown as SharedPlanningApis['plans'],
      wishes: {
        listWishes: vi
          .fn()
          .mockResolvedValue({ items: [wish], nextCursor: null }),
      } as unknown as SharedPlanningApis['wishes'],
    });
    fireEvent.change(screen.getByLabelText(m5s3.plan.intentionLabel), {
      target: { value: 'Our picnic' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('memoryProduct.planning.add'),
      }),
    );
    fireEvent.click(await screen.findByRole('radio', { name: wish.title }));
    fireEvent.click(
      screen.getByRole('button', { name: m5s3.plan.confirmWishLink }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(linkWishToPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: m5s3.common.save }));
    await screen.findByText(i18n.t('composer.planSavedLinkFailed'));
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    await screen.findByText('Plan result');
    expect(createPlan).toHaveBeenCalledTimes(1);
    expect(getPlan).toHaveBeenCalledTimes(1);
    expect(linkWishToPlan).toHaveBeenNthCalledWith(2, {
      spaceId: 'space-1',
      planId: parent.id,
      ifMatch: '4',
      planWishLink: { wishId: wish.id, wishVersion: wish.version },
    });
  });

  it('closes the Place task after an awaited create and saves the canonical Place id', async () => {
    const canonicalPlace = {
      id: 'place-created',
      name: 'Rose garden (saved)',
      address: '42 Garden Street',
    };
    let resolveCreate!: (place: typeof canonicalPlace) => void;
    const response = new Promise<typeof canonicalPlace>((resolve) => {
      resolveCreate = resolve;
    });
    const createPlace = vi.fn(() => response);
    const { createPlan, locations } = renderCreate('plan', {
      places: {
        listPlaces: vi.fn().mockResolvedValue({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
        createPlace,
      } as unknown as SharedPlanningApis['places'],
    });
    const title = screen.getByLabelText(m5s3.plan.intentionLabel);
    fireEvent.change(title, { target: { value: 'Garden picnic' } });
    const placeTool = screen.getByRole('button', {
      name: i18n.t('composer.place'),
    });
    fireEvent.click(placeTool);
    const choice = await screen.findByRole('dialog', {
      name: m5s3.common.place,
    });
    fireEvent.click(
      within(choice).getByRole('button', {
        name: i18n.t('composer.createPlace'),
      }),
    );
    const creation = await screen.findByRole('dialog', {
      name: i18n.t('composer.newPlace'),
    });
    fireEvent.change(within(creation).getByLabelText(m5s3.place.name), {
      target: { value: 'Rose garden' },
    });
    fireEvent.change(within(creation).getByLabelText(m5s3.place.address), {
      target: { value: canonicalPlace.address },
    });
    fireEvent.click(
      within(creation).getByRole('button', {
        name: i18n.t('photoPlaces.saveSharedPlace'),
      }),
    );
    await waitFor(() => expect(createPlace).toHaveBeenCalledTimes(1));
    expect(
      (
        screen.getByRole('button', {
          name: m5s3.common.save,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(creation).getByRole('button', {
          name: m5s3.common.saving,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole('dialog', { name: m5s3.common.place })).toBe(
      choice,
    );
    expect(
      screen.getByRole('dialog', { name: i18n.t('composer.newPlace') }),
    ).toBe(creation);
    expect(createPlan).not.toHaveBeenCalled();

    await act(async () => resolveCreate(canonicalPlace));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      screen.queryByRole('alertdialog', { name: taskBoundary.discardTitle }),
    ).toBeNull();
    expect((title as HTMLInputElement).value).toBe('Garden picnic');
    expect(
      screen.getByRole('button', { name: canonicalPlace.name }),
    ).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(placeTool));
    expect(createPlace).toHaveBeenCalledWith({
      spaceId: 'space-1',
      placeCreate: {
        name: 'Rose garden',
        address: canonicalPlace.address,
        latitude: undefined,
        longitude: undefined,
      },
    });
    const save = screen.getByRole('button', {
      name: m5s3.common.save,
    });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(createPlan.mock.calls[0][0].planCreate.placeId).toBe(
      canonicalPlace.id,
    );
    await waitFor(() =>
      expect(locations.at(-1)).toBe('/plan/plans/plan-created'),
    );
    expect(createPlace).toHaveBeenCalledTimes(1);
  });

  it('selects a searchable saved Place without creating another one', async () => {
    const createPlace = vi.fn();
    const { createPlan } = renderCreate('plan', {
      places: {
        listPlaces: vi.fn().mockResolvedValue({
          items: [{ id: 'place-saved', name: 'Rose garden' }],
          nextCursor: null,
          hasMore: false,
        }),
        createPlace,
      } as unknown as SharedPlanningApis['places'],
    });
    fireEvent.change(screen.getByLabelText(m5s3.plan.intentionLabel), {
      target: { value: 'Picnic' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('composer.place') }),
    );
    fireEvent.change(screen.getByLabelText(i18n.t('photoPlaces.savedSearch')), {
      target: { value: 'Rose' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Rose garden' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(createPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: m5s3.common.save }));
    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(createPlan.mock.calls[0][0].planCreate.placeId).toBe('place-saved');
  });

  it('keeps a failed Wish save editable and protects dirty cancellation', async () => {
    const createWish = vi.fn().mockRejectedValue(new Error('save failed'));
    renderCreate('wish', {
      wishes: { createWish } as unknown as SharedPlanningApis['wishes'],
    });
    const title = screen.getByLabelText(m5s3.wish.intentionLabel);
    fireEvent.change(title, { target: { value: 'See the northern lights' } });
    fireEvent.click(screen.getByRole('button', { name: m5s3.common.save }));

    await waitFor(() => expect(createWish).toHaveBeenCalledTimes(1));
    expect(createWish).toHaveBeenCalledWith({
      spaceId: 'space-1',
      idempotencyKey: expect.any(String),
      wishCreate: { title: 'See the northern lights', tags: [] },
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect((title as HTMLInputElement).value).toBe('See the northern lights');

    fireEvent.click(screen.getByRole('button', { name: taskBoundary.close }));
    expect(
      screen.getByRole('alertdialog', {
        name: taskBoundary.discardTitle,
      }),
    ).toBeDefined();
  });
});
