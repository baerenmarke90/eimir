// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import { i18n } from '../i18n';
import { PlaceProductPage } from './PlaceProductPage';
import { PlacesOverviewPage } from './PlacesOverviewPage';

const PLACE: PlaceDetail = {
  address: 'Park road',
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-08-01T10:00:00Z'),
  createdBy: 'account-1',
  creator: { id: 'account-1', displayName: 'Lea' },
  description: 'Our picnic spot',
  id: 'place-1',
  latitude: null,
  longitude: null,
  name: 'Volkspark',
  spaceId: 'space-1',
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  version: 1,
};

const NEXT_PLACE: PlaceDetail = { ...PLACE, id: 'place-2', name: 'Lake' };

function createApis(placeOverrides: Record<string, unknown> = {}) {
  return {
    places: {
      getPlace: vi.fn().mockResolvedValue(PLACE),
      listPlaces: vi.fn().mockResolvedValue({
        items: [NEXT_PLACE],
        nextCursor: null,
      }),
      ...placeOverrides,
    },
    story: {
      getStoryTimeline: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
    },
    placeRelations: {
      listPlaceMemories: vi.fn().mockResolvedValue({ items: [] }),
      listPlaceHeartMoments: vi.fn().mockResolvedValue({ items: [] }),
      listPlaceMilestones: vi.fn().mockResolvedValue({ items: [] }),
    },
    memories: { getMemory: vi.fn() },
    heartMoments: { getHeartMoment: vi.fn() },
    milestones: { getMilestone: vi.fn() },
  } as unknown as SharedPlanningApis;
}

function renderPlace(
  apis = createApis(),
  includeOverview = false,
  configureClient?: (client: QueryClient) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.placeDetail('space-1', PLACE.id),
    PLACE,
  );
  configureClient?.(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/more/places/${PLACE.id}`]}>
        <Routes>
          <Route
            path="/more/places/:placeId"
            element={<PlaceProductPage apis={apis} spaceId="space-1" />}
          />
          {includeOverview ? (
            <Route
              path="/more/places"
              element={<PlacesOverviewPage apis={apis} spaceId="space-1" />}
            />
          ) : null}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

function renderPlacesOverview(apis: SharedPlanningApis) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/more/places']}>
        <PlacesOverviewPage apis={apis} spaceId="space-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('PlaceProductPage read presentation', () => {
  it('leads with the authored description and keeps technical location metadata secondary', () => {
    renderPlace();

    expect(screen.getByText(PLACE.description as string)).toBeTruthy();
    expect(screen.getByText(PLACE.address as string)).toBeTruthy();

    const summary = screen.getByText(i18n.t('m5s3.place.technicalDetails'));
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(screen.getByText(i18n.t('m5s3.place.noMap'))).toBeTruthy();
  });
});

describe('PlaceProductPage editor lifecycle', () => {
  it('uses the shared contrast modifier for create and edit coordinate guidance', async () => {
    const user = userEvent.setup();
    renderPlacesOverview(createApis());

    await user.click(await screen.findByText(i18n.t('m5s3.place.create')));
    const createHelp = document.querySelector('#create-place-coordinate-help');
    expect(createHelp?.className).toBe('field-help planning-coordinate-help');
    expect(
      screen
        .getByLabelText(i18n.t('m5s3.place.latitude'))
        .getAttribute('aria-describedby'),
    ).toBe('create-place-coordinate-help');
    expect(
      screen
        .getByLabelText(i18n.t('m5s3.place.longitude'))
        .getAttribute('aria-describedby'),
    ).toBe('create-place-coordinate-help');
    cleanup();

    renderPlace();
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    const editHelp = document.querySelector('#place-edit-coordinate-help');
    expect(editHelp?.className).toBe('field-help planning-coordinate-help');
    expect(
      screen
        .getByLabelText(i18n.t('m5s3.place.latitude'))
        .getAttribute('aria-describedby'),
    ).toBe('place-edit-coordinate-help');
    expect(
      screen
        .getByLabelText(i18n.t('m5s3.place.longitude'))
        .getAttribute('aria-describedby'),
    ).toBe('place-edit-coordinate-help');
  });

  it('invalidates the canonical Place family after create and edit mutations', async () => {
    const user = userEvent.setup();
    const createdPlace = { ...PLACE, id: 'place-created', name: 'Café' };
    const createPlace = vi.fn().mockResolvedValue(createdPlace);
    const overviewApis = createApis({
      createPlace,
      listPlaces: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    });
    const overviewClient = renderPlacesOverview(overviewApis);
    const createInvalidation = vi.spyOn(overviewClient, 'invalidateQueries');

    await user.click(await screen.findByText(i18n.t('m5s3.place.create')));
    await user.type(
      screen.getByRole('textbox', { name: i18n.t('m5s3.place.name') }),
      createdPlace.name,
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.save') }),
    );
    await waitFor(() => expect(createPlace).toHaveBeenCalledTimes(1));
    expect(createInvalidation).toHaveBeenCalledWith({
      queryKey: authorSummaryQueryKeys.places('space-1'),
    });
    cleanup();

    const updatedPlace = { ...PLACE, name: 'Volkspark Berlin', version: 2 };
    const updatePlace = vi.fn().mockResolvedValue(updatedPlace);
    const editApis = createApis({
      getPlace: vi.fn().mockResolvedValue(updatedPlace),
      updatePlace,
    });
    const editClient = renderPlace(editApis);
    const editInvalidation = vi.spyOn(editClient, 'invalidateQueries');

    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    const name = screen.getByRole('textbox', {
      name: i18n.t('m5s3.place.name'),
    });
    await user.clear(name);
    await user.type(name, updatedPlace.name);
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.saveChanges'),
      }),
    );

    await waitFor(() => expect(updatePlace).toHaveBeenCalledTimes(1));
    expect(editInvalidation).toHaveBeenCalledWith({
      queryKey: authorSummaryQueryKeys.places('space-1'),
    });
    await screen.findByRole('heading', { name: updatedPlace.name, level: 1 });
  });

  it('focuses the editor, associates coordinate errors, and preserves dirty drafts', async () => {
    const user = userEvent.setup();
    renderPlace();
    const edit = screen.getByRole('button', { name: i18n.t('common.edit') });
    await user.click(edit);

    const name = screen.getByRole('textbox', {
      name: i18n.t('m5s3.place.name'),
    });
    expect(document.activeElement).toBe(name);
    const latitude = screen.getByLabelText(
      i18n.t('m5s3.place.latitude'),
    ) as HTMLInputElement;
    const longitude = screen.getByLabelText(
      i18n.t('m5s3.place.longitude'),
    ) as HTMLInputElement;
    await user.type(latitude, '52.5');
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.saveChanges'),
      }),
    );

    expect(latitude.getAttribute('aria-invalid')).toBe('true');
    expect(longitude.getAttribute('aria-invalid')).toBe('true');
    const error = screen.getByRole('alert');
    expect(latitude.getAttribute('aria-describedby')).toContain(error.id);
    expect(longitude.getAttribute('aria-describedby')).toContain(error.id);

    await user.type(longitude, '13.4');
    expect(latitude.getAttribute('aria-invalid')).toBe('false');
    expect(longitude.getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();

    await user.keyboard('{Escape}');
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.keepEditing') }),
    );
    expect(latitude.value).toBe('52.5');
    expect(longitude.value).toBe('13.4');

    await user.keyboard('{Escape}');
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.discardConfirm'),
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: i18n.t('m5s3.place.name') }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
  });

  it('uses Browser Back to close a clean editor without a phantom entry', async () => {
    const user = userEvent.setup();
    renderPlace();
    const edit = screen.getByRole('button', { name: i18n.t('common.edit') });
    await user.click(edit);
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy();

    window.history.back();

    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: i18n.t('m5s3.place.name') }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeUndefined();
  });

  it('blocks Escape and Browser Back while a save is pending', async () => {
    const user = userEvent.setup();
    const updatePlace = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderPlace(createApis({ updatePlace }));
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    const name = screen.getByRole('textbox', {
      name: i18n.t('m5s3.place.name'),
    });
    await user.type(name, ' changed');
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.saveChanges'),
      }),
    );
    await waitFor(() => expect(updatePlace).toHaveBeenCalledTimes(1));

    await user.keyboard('{Escape}');
    window.history.back();

    expect(
      screen.getByRole('textbox', { name: i18n.t('m5s3.place.name') }),
    ).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('restores delete focus and focuses the successor after success', async () => {
    const user = userEvent.setup();
    const deletePlace = vi.fn().mockResolvedValue(undefined);
    const apis = createApis({ deletePlace });
    const queryClient = renderPlace(apis, true, (queryClient) => {
      queryClient.setQueryData(
        authorSummaryQueryKeys.placesOverview('space-1'),
        {
          pages: [
            { items: [PLACE, NEXT_PLACE], nextCursor: null, hasMore: false },
          ],
          pageParams: [null],
        },
      );
    });
    const invalidation = vi.spyOn(queryClient, 'invalidateQueries');
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    const deleteTrigger = screen.getByRole('button', {
      name: i18n.t('m5s3.common.delete'),
    });
    await user.click(deleteTrigger);
    expect(document.activeElement?.id).toBe('place-delete-heading');

    const deleteCancel = screen
      .getAllByRole('button', { name: i18n.t('common.cancel') })
      .at(-1);
    expect(deleteCancel).toBeDefined();
    await user.click(deleteCancel as HTMLButtonElement);
    const restoredDeleteTrigger = screen.getByRole('button', {
      name: i18n.t('m5s3.common.delete'),
    });
    expect(document.activeElement).toBe(restoredDeleteTrigger);

    await user.click(restoredDeleteTrigger);
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    );
    const successor = (await screen.findByText(NEXT_PLACE.name)).closest('a');
    expect(successor).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(successor));
    expect(invalidation).toHaveBeenCalledWith({
      queryKey: authorSummaryQueryKeys.places('space-1'),
    });
  });
});
