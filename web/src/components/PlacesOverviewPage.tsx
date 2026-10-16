import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import {
  authorSummaryQueryKeys,
  invalidatePlaceConsumers,
} from '../client/authorSummaryConsumers';
import {
  type DeleteFocusTarget,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import { normalizeClientError } from '../client/problemDetails';
import { appRoutePath, placeDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './SharedPlanningPages.css';

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
  const queryClient = useQueryClient();
  const [coordinateError, setCoordinateError] = useState(false);
  const createActionRef = useRef<HTMLElement>(null);
  const placeRefs = useRef(new Map<string, HTMLAnchorElement>());
  const restoredDeleteFocusRef = useRef(false);

  const places = useInfiniteQuery({
    queryKey: authorSummaryQueryKeys.placesOverview(spaceId),
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.places.listPlaces({
          spaceId,
          cursor: pageParam,
          limit: PAGE_SIZE,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor<PlaceDetail>,
    retry: false,
  });

  const createPlace = useMutation({
    mutationFn: (values: {
      name: string;
      description?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
    }) =>
      apiCall(() => apis.places.createPlace({ spaceId, placeCreate: values })),
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
    const form = event.currentTarget;
    const data = new FormData(form);
    const latitudeRaw = String(data.get('latitude')).trim();
    const longitudeRaw = String(data.get('longitude')).trim();
    if (Boolean(latitudeRaw) !== Boolean(longitudeRaw)) {
      setCoordinateError(true);
      return;
    }
    setCoordinateError(false);
    const description = String(data.get('description')).trim();
    const address = String(data.get('address')).trim();
    createPlace.mutate(
      {
        name: String(data.get('name')).trim(),
        description: description || undefined,
        address: address || undefined,
        latitude: latitudeRaw ? Number(latitudeRaw) : undefined,
        longitude: longitudeRaw ? Number(longitudeRaw) : undefined,
      },
      {
        onSuccess: () => {
          form.reset();
          setCoordinateError(false);
        },
      },
    );
  }

  return (
    <div className="page planning-page planning-sanctuary">
      <PageHeader
        before={
          <Link className="back-link" to={appRoutePath('more')}>
            {t('m5s3.common.backToMore')}
          </Link>
        }
        eyebrow={t('navigation.more')}
        title={t('m5s3.place.heading')}
        description={t('m5s3.place.intro')}
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
          <p className="planning-empty">{t('m5s3.place.emptyOverview')}</p>
        ) : (
          <ul className="planning-list">
            {placeItems.map((place) => (
              <li className="planning-card-item" key={place.id}>
                <Link
                  ref={(element) => {
                    if (element) placeRefs.current.set(place.id, element);
                    else placeRefs.current.delete(place.id);
                  }}
                  className="planning-card planning-card-link"
                  to={placeDetailPath(place.id)}
                >
                  <div className="planning-card-copy">
                    <h3>{place.name}</h3>
                    {place.address ? (
                      <p className="planning-meta">{place.address}</p>
                    ) : place.latitude != null && place.longitude != null ? (
                      <p className="planning-meta">
                        {t('m5s3.place.coordinates', {
                          latitude: place.latitude,
                          longitude: place.longitude,
                        })}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {places.hasNextPage ? (
          <button
            type="button"
            className="tertiary compact-action"
            onClick={() => void places.fetchNextPage()}
            disabled={places.isFetchingNextPage}
          >
            {places.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </button>
        ) : null}

        <details className="planning-create" id="place-create-details">
          <summary ref={createActionRef} id="place-name">
            {t('m5s3.place.create')}
          </summary>
          <form
            onSubmit={submitPlace}
            className="form-grid planning-create-form"
          >
            <label htmlFor="create-place-name">{t('m5s3.place.name')}</label>
            <input
              id="create-place-name"
              name="name"
              required
              maxLength={200}
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
            <div className="planning-coordinate-grid">
              <div className="field-group">
                <label htmlFor="create-place-latitude">
                  {t('m5s3.place.latitude')}
                </label>
                <input
                  id="create-place-latitude"
                  name="latitude"
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
          </form>
        </details>
      </section>
    </div>
  );
}
