import './FreeComposer.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import {
  authorSummaryQueryKeys,
  invalidatePlaceConsumers,
} from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import {
  type DeleteFocusTarget,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { captureQueryIdentity } from '../client/queryIdentity';
import { placeDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { DestinationIcon } from './DestinationIcon';
import { PageHeader } from './PageHeader';
import { PlaceMapPicker, type PlaceMapSelection } from './PlaceMapPicker';
import { ProblemState } from './ProblemState';
import { ContentChevron, SharedContentSheet } from './SharedContentSheet';
import type { ShortTaskSheetHandle } from './ShortTaskSheet';
import { StatusScope } from './StatusScope';
import { UiState } from './UiState';
import './SharedPlanningPages.css';
import './SharedContentPages.css';

const PAGE_SIZE = 20;

type PageShape<T> = { items: T[]; nextCursor: string | null };

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function nextCursor<T>(page: PageShape<T>): string | undefined {
  return page.nextCursor ?? undefined;
}

export function PlacesOverviewPage({
  apis,
  spaceId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope =
    searchParams.get('scope') === 'ARCHIVED'
      ? 'ARCHIVED'
      : searchParams.get('scope') === 'ALL'
        ? 'ALL'
        : 'ACTIVE';
  const overviewKey = authorSummaryQueryKeys.placesOverview(spaceId, scope);
  const { captureOrigin } = useTaskOrigin();
  const createInFlightRef = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const createSheetRef = useRef<ShortTaskSheetHandle>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [mapChoice, setMapChoice] = useState<PlaceMapSelection>();
  const [coordinateDraft, setCoordinateDraft] = useState({
    latitude: '',
    longitude: '',
  });
  const [coordinateError, setCoordinateError] = useState(false);
  const createActionRef = useRef<HTMLButtonElement>(null);
  const placeRefs = useRef(new Map<string, HTMLAnchorElement>());
  const restoredDeleteFocusRef = useRef(false);

  const places = useWarmInfiniteQuery({
    queryKey: overviewKey,
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.places.listPlaces({
          spaceId,
          cursor: pageParam,
          limit: PAGE_SIZE,
          order: 'NAME',
          scope,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor<PlaceDetail>,
    retry: false,
  });

  const createPlace = useMutation({
    onSettled: () => {
      createInFlightRef.current = false;
    },
    networkMode: 'always',
    mutationFn: (values: {
      name: string;
      description?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.places.createPlace({ spaceId, placeCreate: values });
      }),
    onSuccess: () => {
      void invalidatePlaceConsumers(queryClient, spaceId);
    },
  });

  const placeItems = places.data?.pages.flatMap((page) => page.items) ?? [];
  const deleteFocusTarget = (
    location.state as Record<string, unknown> | null
  )?.[PLANNING_DELETE_FOCUS_STATE_KEY] as DeleteFocusTarget | undefined;

  useEffect(() => {
    if (restoredDeleteFocusRef.current || !deleteFocusTarget) return;
    const requestedTarget =
      deleteFocusTarget.kind === 'item'
        ? placeRefs.current.get(deleteFocusTarget.id)
        : createActionRef.current;
    if (!requestedTarget && places.isFetching) return;
    (requestedTarget ?? createActionRef.current)?.focus();
    restoredDeleteFocusRef.current = true;
  }, [deleteFocusTarget, places.isFetching]);

  function submitPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createInFlightRef.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const latitudeRaw = coordinateDraft.latitude.trim();
    const longitudeRaw = coordinateDraft.longitude.trim();
    if (Boolean(latitudeRaw) !== Boolean(longitudeRaw)) {
      setCoordinateError(true);
      return;
    }
    setCoordinateError(false);
    const description = String(data.get('description')).trim();
    const address = String(data.get('address')).trim();
    const isCurrentQuery = captureQueryIdentity(queryClient, overviewKey);
    createInFlightRef.current = true;
    createPlace.mutate(
      {
        name: String(data.get('name')).trim(),
        description: description || undefined,
        address: address || undefined,
        latitude: latitudeRaw ? Number(latitudeRaw) : undefined,
        longitude: longitudeRaw ? Number(longitudeRaw) : undefined,
      },
      {
        onSuccess: (created) => {
          if (
            !isCurrentQuery() ||
            ['unauthorized', 'permission', 'notFound'].includes(
              clientProblemKind(queryClient.getQueryState(overviewKey)?.error),
            )
          )
            return;
          form.reset();
          setCreateDirty(false);
          queryClient.setQueryData(
            authorSummaryQueryKeys.placeDetail(spaceId, created.id),
            created,
          );
          createSheetRef.current?.closeForNavigation(() =>
            navigate(placeDetailPath(created.id), {
              state: { taskOriginKey: captureOrigin() },
            }),
          );
          setMapChoice(undefined);
          setCoordinateDraft({ latitude: '', longitude: '' });
          setCoordinateError(false);
        },
      },
    );
  }

  return (
    <div className="page shared-content-page">
      <PageHeader
        className="content-overview-heading"
        title={t('m5s3.place.heading')}
        action={
          <AddActionButton
            floating
            label={t('m5s3.place.create')}
            icon="orte"
            ref={createActionRef}
            id="place-name"
            onClick={() => {
              createPlace.reset();
              setCreateOpen(true);
            }}
          />
        }
      />

      <StatusScope
        label={t('m5s3.place.scope')}
        value={scope}
        options={(['ACTIVE', 'ARCHIVED', 'ALL'] as const).map((value) => ({
          value,
          label: t(`m5s3.place.scope${value}`),
        }))}
        onChange={(next) => {
          const params = new URLSearchParams(searchParams);
          if (next === 'ACTIVE') params.delete('scope');
          else params.set('scope', next);
          setSearchParams(params);
        }}
      />
      <section className="planning-subsection">
        {places.isLoading ? (
          <UiState kind="loading" title={t('states.loading.title')} />
        ) : null}
        {places.error ? (
          <ProblemState
            error={places.error}
            onRetry={() => void places.refetch()}
          />
        ) : null}

        {placeItems.length === 0 && !places.isLoading && !places.error ? (
          <p className="planning-empty">
            {t(
              scope === 'ARCHIVED'
                ? 'm5s3.place.emptyArchive'
                : 'm5s3.place.emptyOverview',
            )}
          </p>
        ) : (
          <ul className="content-overview-list content-overview-places">
            {placeItems.map((place) => (
              <li className="planning-card-item" key={place.id}>
                <Link
                  ref={(element) => {
                    if (element) placeRefs.current.set(place.id, element);
                    else placeRefs.current.delete(place.id);
                  }}
                  className="content-overview-row"
                  to={placeDetailPath(place.id)}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    const taskOriginKey = captureOrigin();
                    navigate(placeDetailPath(place.id), {
                      state: { taskOriginKey },
                    });
                  }}
                >
                  <span className="content-overview-icon">
                    <DestinationIcon icon="places" />
                  </span>
                  <div className="content-overview-copy">
                    <h2>{place.name}</h2>
                    {place.archived ? (
                      <span className="planning-meta">
                        {t('m5s3.place.scopeARCHIVED')}
                      </span>
                    ) : null}
                    {place.address ? (
                      <p className="planning-meta">{place.address}</p>
                    ) : null}
                    {place.description ? (
                      <p className="content-overview-preview">
                        {place.description}
                      </p>
                    ) : null}
                  </div>
                  <ContentChevron />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {places.hasNextPage ? (
          <AutoLoadMore
            query={places}
            className="tertiary compact-action"
            blocked={places.isFetchingNextPage}
          >
            {places.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </AutoLoadMore>
        ) : null}

        <SharedContentSheet
          open={createOpen}
          title={t('m5s3.place.create')}
          isDirty={createDirty}
          isPending={createPlace.isPending}
          initialFocusRef={nameInputRef}
          restoreFocusRef={createActionRef}
          sheetRef={createSheetRef}
          onClose={() => {
            setCreateOpen(false);
            setCreateDirty(false);
            setMapChoice(undefined);
            setCoordinateDraft({ latitude: '', longitude: '' });
            setCoordinateError(false);
          }}
        >
          {(requestClose) => (
            <form
              ref={createFormRef}
              onSubmit={submitPlace}
              className="form-grid planning-create-form free-composer"
              onChange={(event) =>
                setCreateDirty(
                  Array.from(new FormData(event.currentTarget).values()).some(
                    (value) => String(value).length > 0,
                  ),
                )
              }
            >
              <fieldset
                className="form-grid shared-content-fields"
                disabled={createPlace.isPending}
              >
                <label htmlFor="create-place-name">
                  {t('m5s3.place.name')}
                </label>
                <input
                  ref={nameInputRef}
                  id="create-place-name"
                  name="name"
                  required
                  maxLength={200}
                />
                <PlaceMapPicker
                  api={apis.places}
                  spaceId={spaceId}
                  value={mapChoice}
                  disabled={createPlace.isPending}
                  onSelect={(selection) => {
                    setMapChoice(selection);
                    setCoordinateDraft({
                      latitude: String(selection.latitude),
                      longitude: String(selection.longitude),
                    });
                    setCreateDirty(true);
                    setCoordinateError(false);
                    const form = createFormRef.current;
                    if (!form) return;
                    for (const [name, value] of Object.entries({
                      name: selection.name,
                      address: selection.address ?? '',
                    })) {
                      const input = form.elements.namedItem(name);
                      if (input instanceof HTMLInputElement)
                        input.value = value;
                    }
                  }}
                />

                <label htmlFor="create-place-description">
                  {t('m5s3.common.description')}
                </label>
                <textarea
                  id="create-place-description"
                  name="description"
                  rows={3}
                />
                <label htmlFor="create-place-address">
                  {t('m5s3.place.address')}
                </label>
                <input id="create-place-address" name="address" />
                <details className="planning-technical-details">
                  <summary>{t('m5s3.place.technicalDetails')}</summary>
                  <div className="planning-coordinate-grid">
                    <div className="field-group">
                      <label htmlFor="create-place-latitude">
                        {t('m5s3.place.latitude')}
                      </label>
                      <input
                        id="create-place-latitude"
                        name="latitude"
                        value={coordinateDraft.latitude}
                        onChange={(event) =>
                          setCoordinateDraft((draft) => ({
                            ...draft,
                            latitude: event.target.value,
                          }))
                        }
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        aria-invalid={coordinateError}
                        aria-describedby={
                          coordinateError
                            ? 'create-place-coordinate-help create-place-coordinate-error'
                            : 'create-place-coordinate-help'
                        }
                      />
                    </div>
                    <div className="field-group">
                      <label htmlFor="create-place-longitude">
                        {t('m5s3.place.longitude')}
                      </label>
                      <input
                        id="create-place-longitude"
                        name="longitude"
                        value={coordinateDraft.longitude}
                        onChange={(event) =>
                          setCoordinateDraft((draft) => ({
                            ...draft,
                            longitude: event.target.value,
                          }))
                        }
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        aria-invalid={coordinateError}
                        aria-describedby={
                          coordinateError
                            ? 'create-place-coordinate-help create-place-coordinate-error'
                            : 'create-place-coordinate-help'
                        }
                      />
                    </div>
                  </div>
                  <p
                    id="create-place-coordinate-help"
                    className="field-help planning-coordinate-help"
                  >
                    {t('m5s3.place.coordinateHelp')}
                  </p>
                </details>
                {coordinateError ? (
                  <p
                    id="create-place-coordinate-error"
                    role="alert"
                    className="field-error"
                  >
                    {t('m5s3.place.coordinatePairError')}
                  </p>
                ) : null}
                <button type="submit" disabled={createPlace.isPending}>
                  {createPlace.isPending
                    ? t('m5s3.common.saving')
                    : t('m5s3.common.save')}
                </button>
                {createPlace.error ? (
                  <ProblemState error={createPlace.error} />
                ) : null}
                <button
                  type="button"
                  className="tertiary"
                  disabled={createPlace.isPending}
                  onClick={requestClose}
                >
                  {t('common.cancel')}
                </button>
              </fieldset>
            </form>
          )}
        </SharedContentSheet>
      </section>
    </div>
  );
}
