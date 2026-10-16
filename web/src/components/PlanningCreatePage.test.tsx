// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import de from '../i18n/locales/de';
import m5s3 from '../i18n/locales/m5s3';
import taskBoundary from '../i18n/locales/taskBoundary';
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
  it('keeps shared visibility domain-correct for Plans and Wishes', () => {
    const { unmount } = renderCreate('wish');

    expect(screen.getByText(m5s3.wish.sharedBody)).toBeTruthy();
    expect(screen.queryByText(m5s3.plan.sharedBody)).toBeNull();

    unmount();
    renderCreate('plan');

    expect(screen.getByText(m5s3.plan.sharedBody)).toBeTruthy();
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
        description: undefined,
        placeId: undefined,
        schedule: undefined,
      },
    });
    await waitFor(() =>
      expect(locations.at(-1)).toBe('/plan/plans/plan-created'),
    );
  });

  it('preserves date-only schedule semantics inside optional enrichment', async () => {
    const { createPlan } = renderCreate('plan');
    fireEvent.change(screen.getByLabelText(m5s3.plan.intentionLabel), {
      target: { value: 'Day trip' },
    });
    fireEvent.click(screen.getByText(m5s3.plan.addDetails));
    fireEvent.change(screen.getByLabelText(m5s3.plan.plannedDate), {
      target: { value: '2026-10-03' },
    });
    fireEvent.click(screen.getByRole('button', { name: m5s3.common.save }));

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    const request = createPlan.mock.calls[0]?.[0];
    expect(request.planCreate.schedule).toEqual({
      plannedOn: new Date('2026-10-03T00:00:00Z'),
    });
  });

  it('creates and selects a Place without leaving the focused Plan task', async () => {
    const createPlace = vi
      .fn()
      .mockResolvedValue({ id: 'place-new', name: 'Rose garden' });
    renderCreate('plan', {
      places: {
        listPlaces: vi.fn().mockResolvedValue({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
        createPlace,
      } as unknown as SharedPlanningApis['places'],
    });

    fireEvent.click(screen.getByText(m5s3.plan.addDetails));
    fireEvent.click(
      screen.getByRole('button', { name: m5s3.plan.addNewPlace }),
    );
    fireEvent.change(screen.getByLabelText(m5s3.place.name), {
      target: { value: 'Rose garden' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: m5s3.plan.newPlaceSave }),
    );

    await waitFor(() => expect(createPlace).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (screen.getByLabelText(m5s3.common.place) as HTMLSelectElement).value,
      ).toBe('place-new'),
    );
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
      wishCreate: { title: 'See the northern lights' },
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect((title as HTMLInputElement).value).toBe('See the northern lights');

    fireEvent.click(screen.getByRole('button', { name: de.common.cancel }));
    expect(
      screen.getByRole('alertdialog', {
        name: taskBoundary.discardTitle,
      }),
    ).toBeDefined();
  });
});
