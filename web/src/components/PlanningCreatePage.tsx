import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import {
  authorSummaryQueryKeys,
  invalidatePlaceConsumers,
} from '../client/authorSummaryConsumers';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  type ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { planDetailPath, wishDetailPath } from '../client/routes';
import {
  loadAllPlaces,
  planScheduleFromInputs,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import { PageHeader } from './PageHeader';
import { PlanScheduleFields } from './PlanScheduleFields';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './PlanningCreatePage.css';

type PlanningCreateKind = 'plan' | 'wish';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function PlanningCreatePage({
  apis,
  spaceId,
  kind,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  kind: PlanningCreateKind;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const headingRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<ShortTaskSheetHandle>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [isCreatingPlace, setIsCreatingPlace] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newPlaceAddress, setNewPlaceAddress] = useState('');
  const [enrichmentDirty, setEnrichmentDirty] = useState(false);
  const [offlineAttempt, setOfflineAttempt] = useState(false);
  const [problem, setProblem] = useState<ClientProblemError | null>(null);
  const [pending, setPending] = useState(false);

  const placesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeOptions(spaceId),
    queryFn: () => apiCall(() => loadAllPlaces(apis, spaceId)),
    enabled: kind === 'plan',
    staleTime: 30_000,
    retry: false,
  });

  const dirty = Boolean(title || description || placeId || enrichmentDirty);
  const onClose = useCallback(
    () => requestReturn(originKey, '/plan'),
    [originKey, requestReturn],
  );
  const {
    showDiscardConfirm: showDiscard,
    keepEditing,
    closeConfirmed: closeTask,
    requestClose,
  } = useTaskEditorLifecycle({
    isDirty: dirty,
    isCloseBlocked: pending,
    onClose,
  });

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const createMutation = useMutation({
    mutationFn: async (values: {
      title: string;
      description?: string;
      placeId?: string;
      schedule?: PlanSchedule;
    }) => {
      if (kind === 'wish') {
        return apiCall(() =>
          apis.wishes.createWish({
            spaceId,
            wishCreate: { title: values.title },
          }),
        );
      }
      return apiCall(() =>
        apis.plans.createPlan({ spaceId, planCreate: values }),
      );
    },
    onSuccess: async (created) => {
      const queryKey =
        kind === 'plan'
          ? authorSummaryQueryKeys.planDetail(spaceId, created.id)
          : authorSummaryQueryKeys.wishDetail(spaceId, created.id);
      queryClient.setQueryData(queryKey, created);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', kind === 'plan' ? 'plans' : 'wishes', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      closeTask(() => {
        navigate(
          kind === 'plan'
            ? planDetailPath(created.id)
            : wishDetailPath(created.id),
          {
            replace: true,
            state: { taskOriginKey: originKey, planningCreated: true },
          },
        );
      });
    },
    onError: (error) => {
      setPending(false);
      setProblem(error as ClientProblemError);
    },
  });

  const createPlaceMutation = useMutation({
    mutationFn: (values: { name: string; address?: string }) =>
      apiCall(() => apis.places.createPlace({ spaceId, placeCreate: values })),
    onSuccess: async (created) => {
      await invalidatePlaceConsumers(queryClient, spaceId);
      queryClient.setQueryData(
        authorSummaryQueryKeys.placeOptions(spaceId),
        (current: typeof placesQuery.data) => [
          ...(current ?? []).filter((place) => place.id !== created.id),
          created,
        ],
      );
      setPlaceId(created.id);
      setIsCreatingPlace(false);
      setNewPlaceName('');
      setNewPlaceAddress('');
    },
  });

  function submitNewPlace() {
    const name = newPlaceName.trim();
    if (!name || createPlaceMutation.isPending) return;
    const address = newPlaceAddress.trim();
    createPlaceMutation.mutate({ name, address: address || undefined });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !title.trim()) return;
    if (!navigator.onLine) {
      setOfflineAttempt(true);
      return;
    }
    const data = new FormData(event.currentTarget);
    const schedule =
      kind === 'plan'
        ? planScheduleFromInputs(
            String(data.get('plannedDate') ?? ''),
            String(data.get('plannedTime') ?? ''),
          )
        : undefined;
    setOfflineAttempt(false);
    setProblem(null);
    setPending(true);
    createMutation.mutate({
      title: title.trim(),
      description:
        kind === 'plan' && description.trim() ? description.trim() : undefined,
      placeId: kind === 'plan' && placeId ? placeId : undefined,
      schedule,
    });
  }

  const isPlan = kind === 'plan';
  return (
    <div className="page planning-create-task">
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={pending}
          >
            {t('taskBoundary.close')}
          </button>
        }
        eyebrow={t(
          isPlan ? 'm5s3.plan.createEyebrow' : 'm5s3.wish.createEyebrow',
        )}
        title={t(
          isPlan ? 'm5s3.plan.createHeading' : 'm5s3.wish.createHeading',
        )}
        description={t(
          isPlan ? 'm5s3.plan.createIntro' : 'm5s3.wish.createIntro',
        )}
      />
      <div ref={headingRef} tabIndex={-1} className="planning-task-focus" />

      <form className="planning-intention-form" onSubmit={submit}>
        <fieldset
          disabled={pending}
          onChange={(event) => {
            if ((event.target as HTMLInputElement).name !== 'title')
              setEnrichmentDirty(true);
          }}
        >
          <legend className="sr-only">
            {t(isPlan ? 'm5s3.plan.createHeading' : 'm5s3.wish.createHeading')}
          </legend>
          <div className="field-group planning-intention-field">
            <label htmlFor="planning-create-title">
              {t(
                isPlan
                  ? 'm5s3.plan.intentionLabel'
                  : 'm5s3.wish.intentionLabel',
              )}
            </label>
            <input
              id="planning-create-title"
              name="title"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t(
                isPlan
                  ? 'm5s3.plan.intentionPlaceholder'
                  : 'm5s3.wish.intentionPlaceholder',
              )}
            />
          </div>

          {isPlan ? (
            <details className="planning-optional-details">
              <summary>{t('m5s3.plan.addDetails')}</summary>
              <div className="planning-optional-fields">
                <label htmlFor="planning-create-description">
                  {t('m5s3.common.description')}
                </label>
                <textarea
                  id="planning-create-description"
                  name="description"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <label htmlFor="planning-create-place">
                  {t('m5s3.common.place')}
                </label>
                <select
                  id="planning-create-place"
                  name="placeId"
                  value={placeId}
                  onChange={(event) => setPlaceId(event.target.value)}
                >
                  <option value="">{t('m5s3.common.noPlace')}</option>
                  {placesQuery.data?.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button-link secondary-link planning-add-place"
                  onClick={() => setIsCreatingPlace(true)}
                  disabled={isCreatingPlace || createPlaceMutation.isPending}
                >
                  {t('m5s3.plan.addNewPlace')}
                </button>
                {isCreatingPlace ? (
                  <div className="planning-new-place">
                    <div className="field-group">
                      <label htmlFor="planning-create-place-name">
                        {t('m5s3.place.name')}
                      </label>
                      <input
                        id="planning-create-place-name"
                        value={newPlaceName}
                        onChange={(event) =>
                          setNewPlaceName(event.target.value)
                        }
                        maxLength={200}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.preventDefault();
                        }}
                      />
                    </div>
                    <div className="field-group">
                      <label htmlFor="planning-create-place-address">
                        {t('m5s3.place.address')}
                      </label>
                      <input
                        id="planning-create-place-address"
                        value={newPlaceAddress}
                        onChange={(event) =>
                          setNewPlaceAddress(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.preventDefault();
                        }}
                      />
                    </div>
                    <div className="form-actions planning-new-place-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setIsCreatingPlace(false);
                          setNewPlaceName('');
                          setNewPlaceAddress('');
                        }}
                      >
                        {t('m5s3.plan.newPlaceCancel')}
                      </button>
                      <button
                        type="button"
                        onClick={submitNewPlace}
                        disabled={
                          createPlaceMutation.isPending || !newPlaceName.trim()
                        }
                      >
                        {createPlaceMutation.isPending
                          ? t('m5s3.plan.newPlaceSaving')
                          : t('m5s3.plan.newPlaceSave')}
                      </button>
                    </div>
                    {createPlaceMutation.error ? (
                      <ProblemState
                        error={createPlaceMutation.error as ClientProblemError}
                      />
                    ) : null}
                  </div>
                ) : null}
                <PlanScheduleFields idPrefix="planning-create-schedule" />
              </div>
            </details>
          ) : null}

          <div
            className="planen-shared-note planning-create-sharing"
            role="note"
            aria-label={t('m5s3.plan.sharedTitle')}
          >
            <span className="planen-shared-note-icon" aria-hidden="true">
              <DestinationIcon icon="people" />
            </span>
            <div>
              <strong>{t('m5s3.plan.sharedTitle')}</strong>
              <p>
                {t(
                  kind === 'wish'
                    ? 'm5s3.wish.sharedBody'
                    : 'm5s3.plan.sharedBody',
                )}
              </p>
            </div>
          </div>
        </fieldset>

        <div className="form-actions planning-task-actions">
          <button type="button" className="secondary" onClick={requestClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={pending || !title.trim()}>
            {pending ? t('m5s3.common.saving') : t('m5s3.common.save')}
          </button>
        </div>
      </form>

      {pending ? (
        <p className="status" role="status" aria-live="polite">
          {t('m5s3.common.saving')}
        </p>
      ) : null}
      {offlineAttempt ? (
        <p className="inline-message" role="alert">
          {t('taskBoundary.offline')}
        </p>
      ) : null}
      {problem ? <ProblemState error={problem} /> : null}

      <ShortTaskSheet
        ref={discardRef}
        open={showDiscard}
        role="alertdialog"
        title={t('taskBoundary.discardTitle')}
        onClose={keepEditing}
      >
        <p>{t('taskBoundary.discardBody')}</p>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={keepEditing}>
            {t('taskBoundary.keepEditing')}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() =>
              discardRef.current?.closeForNavigation(() => closeTask())
            }
          >
            {t('taskBoundary.discard')}
          </button>
        </div>
      </ShortTaskSheet>
    </div>
  );
}
