import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { MilestoneDetail } from '../api/generated/models/MilestoneDetail';
import {
  MilestoneDetailFromJSON,
  MilestoneDetailToJSON,
} from '../api/generated/models/MilestoneDetail';
import type { MilestoneUpdate } from '../api/generated/models/MilestoneUpdate';
import { useApiRuntime } from '../client/apiRuntimeContext';
import {
  authorSummaryQueryKeys,
  invalidateStoryProjections,
} from '../client/authorSummaryConsumers';
import {
  type CreateRequestAttempt,
  submitCreateRequest,
} from '../client/createRequestIdentity';
import { invalidateDashboard } from '../client/dashboardQueries';
import { localDateInputValue } from '../client/dateInput';
import {
  previousEntryIs,
  useLeaveDeletedEntries,
  useReturnTo,
} from '../client/historyEntries';
import { occasionsOn } from '../client/occasionMatches';
import { usePartnerNickname } from '../client/partnerNickname';
import { normalizeClientError } from '../client/problemDetails';
import { loadProductWithReadCache } from '../client/productReadCache';
import type { ReferenceApis } from '../client/referenceFlow';
import { formatRelativeElapsed } from '../client/relativeElapsed';
import {
  appRoutePath,
  milestoneDetailPath,
  milestoneEditPath,
} from '../client/routes';
import { useStoryViewReceipt } from '../client/storyViewReceipt';
import { useTaskOrigin } from '../client/taskOrigin';
import { useItemSheets } from '../client/useItemSheets';
import { usePlanCaptureSource } from '../client/usePlanCaptureSource';
import { useSpaceOccasions } from '../client/useSpaceOccasions';
import { useStoryDeletion } from '../client/useStoryDeletion';
import { resolvedLocale, useTranslation } from '../i18n';
import { CommentsPanel } from './CommentsPanel';
import {
  ComposerDateContext,
  type ComposerDateContextHandle,
} from './ComposerDateContext';
import { ExpandableDescription } from './ExpandableDescription';
import {
  ItemDeleteSheet,
  ItemMenuOption,
  ItemMenuSheet,
  ItemMenuTrigger,
  leaveItemMenu,
} from './ItemActions';
import { NativeDateField } from './NativeDateField';
import { OccasionMark } from './OccasionMark';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import type { ShortTaskSheetHandle } from './ShortTaskSheet';
import { StoryDetailPageShell } from './StoryDetailPageShell';
import {
  ComposerHeader,
  StoryCreatePageShell,
  StoryEditorPageShell,
} from './StoryFormPageShell';
import { StoryPlanningLinks } from './StoryPlanningLinks';
import { storyAuthorLabel } from './storyPresentation';
import { TaskBackButton, TaskBackLink } from './TaskBackButton';
import { UiState } from './UiState';
import './MilestoneProductPage.css';

export type MilestoneProductMode = 'create' | 'detail' | 'edit';

interface MilestoneCreateValues {
  readonly title: string;
  readonly body?: string;
  readonly happenedOn: Date;
}

interface MilestoneCreateSnapshot {
  readonly spaceId: string;
  readonly milestoneCreate: MilestoneCreateValues;
}

function formatDateOnly(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

function formatCreatedAt(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  }).format(value);
}

function dateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function MilestoneProductPage({
  mode,
  apis,
  spaceId,
  currentAccountId,
  startupRead,
}: {
  mode: MilestoneProductMode;
  apis: ReferenceApis;
  spaceId: string;
  currentAccountId: string;
  startupRead?: () => Promise<MilestoneDetail> | undefined;
}) {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const returnTo = useReturnTo();
  const leaveDeleted = useLeaveDeletedEntries();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const params = useParams();
  const queryClient = useQueryClient();
  const occasions = useSpaceOccasions(spaceId, currentAccountId);
  const runtime = useApiRuntime();
  const {
    eligibleSourcePlanId,
    loading: sourceLoading,
    sourcePlan,
  } = usePlanCaptureSource({
    apiBaseUrl: runtime?.apiBaseUrl ?? '',
    accessToken: runtime?.accessToken ?? '',
    spaceId,
    accountId: currentAccountId,
    enabled: mode === 'create',
    loadPlace: false,
  });
  const milestoneId = params.milestoneId;
  const queryKey = authorSummaryQueryKeys.milestone(spaceId, milestoneId);
  const deleteKey = [
    'milestone-delete',
    currentAccountId,
    spaceId,
    milestoneId,
  ] as const;
  const updateKey = [
    'milestone-update',
    currentAccountId,
    spaceId,
    milestoneId,
  ] as const;
  const updating = useIsMutating({ mutationKey: updateKey, exact: true }) > 0;
  const createAttemptRef =
    useRef<CreateRequestAttempt<MilestoneCreateSnapshot> | null>(null);
  const dateContextRef = useRef<ComposerDateContextHandle>(null);
  const [createDate, setCreateDate] = useState(localDateInputValue);
  const [createTitle, setCreateTitle] = useState('');
  const sheets = useItemSheets(milestoneId);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const deleteSheet = useRef<ShortTaskSheetHandle>(null);
  const menuSheet = useRef<ShortTaskSheetHandle>(null);

  const milestoneQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!milestoneId) throw new Error('Missing Milestone route parameter.');
      return loadProductWithReadCache({
        accountId: currentAccountId,
        spaceId,
        kind: 'milestone',
        resourceId: milestoneId,
        load: () =>
          startupRead?.() ??
          apis.milestones.getMilestone({ spaceId, milestoneId }),
        serialize: MilestoneDetailToJSON,
        deserialize: (payload) => MilestoneDetailFromJSON(payload),
      });
    },
    enabled: mode !== 'create' && Boolean(milestoneId),
    retry: false,
  });

  // A confirmed delete evicts the read before the confirmation sheet has left;
  // the page keeps showing the deleted Milestone until that hand-off navigates.
  const [leaving, setLeaving] = useState(false);
  const lastRead = useRef(milestoneQuery.data);
  if (milestoneQuery.data) lastRead.current = milestoneQuery.data;
  const holdForLeave = leaving && Boolean(lastRead.current);

  useStoryViewReceipt({
    apis,
    spaceId,
    kind: 'MILESTONE',
    itemId: milestoneId ?? '',
    presented: mode === 'detail' && milestoneQuery.isSuccess,
  });

  const createMutation = useMutation({
    mutationFn: async (values: MilestoneCreateValues) => {
      const snapshot: MilestoneCreateSnapshot = {
        spaceId,
        milestoneCreate: values,
      };
      return submitCreateRequest({
        previousAttempt: createAttemptRef.current,
        snapshot,
        rememberAttempt: (attempt) => {
          createAttemptRef.current = attempt;
        },
        request: (idempotencyKey) =>
          apis.milestones.createMilestone({
            ...snapshot,
            idempotencyKey,
          }),
      });
    },
    onSuccess: async (milestone) => {
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(milestoneDetailPath(milestone.id), {
        replace: true,
        state: {
          saved: true,
          taskOriginKey: originKey,
          sourcePlanToLink:
            eligibleSourcePlanId && runtime
              ? {
                  id: eligibleSourcePlanId,
                  contentKind: 'MILESTONE',
                  contentId: milestone.id,
                  accountId: currentAccountId,
                  spaceId,
                  instance: runtime.apiBaseUrl,
                }
              : undefined,
        },
      });
    },
  });

  const updateMutation = useMutation({
    mutationKey: updateKey,
    mutationFn: async ({
      current,
      update,
    }: {
      current: MilestoneDetail;
      update: MilestoneUpdate;
    }) => {
      try {
        return await apis.milestones.updateMilestone({
          spaceId,
          milestoneId: current.id,
          ifMatch: String(current.version),
          milestoneUpdate: update,
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async ({ current, update }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, {
        value: {
          ...current,
          title: update.title ?? current.title,
          body: update.body === undefined ? current.body : update.body,
          happenedOn: update.happenedOn ?? current.happenedOn,
          updatedAt: new Date(),
        },
        source: 'network',
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: async (milestone) => {
      queryClient.setQueryData(queryKey, {
        value: milestone,
        source: 'network',
      });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        queryClient.invalidateQueries({ queryKey }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      returnTo(milestoneDetailPath(milestone.id), {
        state: { taskOriginKey: originKey },
      });
    },
  });

  const deleteMutation = useStoryDeletion<MilestoneDetail>({
    active: mode === 'detail',
    accountId: currentAccountId,
    spaceId,
    resourceId: milestoneId,
    kind: 'milestone',
    version: milestoneQuery.data?.value.version,
    queryKey,
    mutationKey: deleteKey,
    conflictingMutationKeys: [updateKey],
    execute: (milestone) =>
      apis.milestones.deleteMilestone({
        spaceId,
        milestoneId: milestone.id,
        ifMatch: String(milestone.version),
      }),
    onDeleted: () => {
      const leave = () =>
        leaveDeleted(
          milestoneDetailPath(milestoneId ?? ''),
          appRoutePath('story'),
        );
      setLeaving(true);
      // The confirmation sheet releases its history entry before leaving.
      if (deleteSheet.current) deleteSheet.current.closeForNavigation(leave);
      else leave();
    },
  });
  const deleting = deleteMutation.isPending;

  if (mode === 'create') {
    function submitCreate(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (sourceLoading || createMutation.isPending) return;
      if (!dateContextRef.current?.reportValidity()) return;
      const data = new FormData(event.currentTarget);
      const happenedOn = String(data.get('happenedOn') || '');
      if (!happenedOn) return;
      const body = String(data.get('body') || '').trim();
      createMutation.mutate({
        title: String(data.get('title') || '').trim(),
        body: body || undefined,
        happenedOn: new Date(`${happenedOn}T00:00:00Z`),
      });
    }

    return (
      <StoryCreatePageShell
        header={
          <ComposerHeader
            before={
              <TaskBackButton
                inline
                type="button"
                onClick={() => requestReturn(originKey)}
              />
            }
            title={t('milestoneProduct.createHeading')}
            className="create-heading"
            action={
              <button
                type="submit"
                form="milestone-create-form"
                className="composer-save-action"
                data-saveable={createTitle.trim().length > 0}
                aria-label={
                  createMutation.isPending
                    ? t('milestoneProduct.saving')
                    : t('milestoneProduct.save')
                }
                disabled={createMutation.isPending || sourceLoading}
              >
                {createMutation.isPending
                  ? t('milestoneProduct.saving')
                  : t('m5s3.common.save')}
              </button>
            }
          />
        }
        pageClassName="milestone-create-page quiet-composer page-composer"
        labelledBy="milestone-form-heading"
      >
        <>
          <h2 id="milestone-form-heading" className="sr-only">
            {t('milestoneProduct.createHeading')}
          </h2>
          {sourceLoading ? (
            <p role="status">{t('m5s3.planStory.loadingSource')}</p>
          ) : null}
          {sourcePlan.error ? (
            <ProblemState
              error={sourcePlan.error}
              onRetry={() => void sourcePlan.refetch()}
            />
          ) : null}
          <form
            id="milestone-create-form"
            onSubmit={submitCreate}
            className="immersive-create-form"
          >
            <fieldset
              className="memory-task-fields"
              disabled={createMutation.isPending}
            >
              <legend className="sr-only">
                {t('milestoneProduct.createHeading')}
              </legend>
              <div className="composer-context">
                <ComposerDateContext
                  ref={dateContextRef}
                  idPrefix="milestone-date"
                  name="happenedOn"
                  formId="milestone-create-form"
                  label={t('milestoneProduct.happenedOnLabel')}
                  required
                  value={createDate}
                  onChange={setCreateDate}
                />
              </div>
              <div className="composer-content">
                <div className="composer-writing-surface composer-authored-surface">
                  <div className="field-group immersive-create-title-field">
                    <label htmlFor="milestone-title">
                      {t('milestoneProduct.titleLabel')}
                    </label>
                    <input
                      id="milestone-title"
                      name="title"
                      required
                      maxLength={200}
                      value={createTitle}
                      onChange={(event) => setCreateTitle(event.target.value)}
                      placeholder={t('milestoneProduct.titlePlaceholder')}
                      className="immersive-create-title-input"
                    />
                  </div>
                  <div className="field-group immersive-create-narrative">
                    <label htmlFor="milestone-body">
                      {t('milestoneProduct.bodyLabel')}
                    </label>
                    <textarea
                      id="milestone-body"
                      name="body"
                      rows={4}
                      placeholder={t('milestoneProduct.bodyPlaceholder')}
                    />
                  </div>
                </div>
              </div>
            </fieldset>
          </form>
          {createMutation.error ? (
            <ProblemState error={createMutation.error} />
          ) : null}
        </>
      </StoryCreatePageShell>
    );
  }

  if (!milestoneId) {
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  }
  if (milestoneQuery.isLoading && !holdForLeave) {
    return <UiState kind="loading" title={t('milestoneProduct.loading')} />;
  }
  if (milestoneQuery.error && !holdForLeave) {
    return (
      <ProblemState
        error={milestoneQuery.error}
        onRetry={() => void milestoneQuery.refetch()}
      />
    );
  }
  const result =
    milestoneQuery.data ?? (holdForLeave ? lastRead.current : undefined);
  if (!result) return null;
  const milestone = result.value;
  const offline = result.source === 'cache';

  if (mode === 'edit') {
    if (!milestone.capabilities.canEdit || offline) {
      return (
        <div className="page page-reading">
          <PageHeader
            before={
              <TaskBackLink
                to={milestoneDetailPath(milestone.id)}
                state={{ taskOriginKey: originKey }}
              >
                {t('milestoneProduct.backToMilestone')}
              </TaskBackLink>
            }
            title={t('milestoneProduct.editHeading')}
          />
          <UiState
            kind={offline ? 'offline' : 'permission'}
            title={
              offline
                ? t('states.offline.title')
                : t('milestoneProduct.editNotAllowedTitle')
            }
            body={
              offline
                ? t('states.offline.body')
                : t('milestoneProduct.editNotAllowedBody')
            }
          />
        </div>
      );
    }

    function submitEdit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (
        queryClient.isMutating({ mutationKey: deleteKey }) ||
        queryClient.isMutating({ mutationKey: updateKey, exact: true })
      )
        return;
      const data = new FormData(event.currentTarget);
      const happenedOn = String(data.get('happenedOn') || '');
      const body = String(data.get('body') || '').trim();
      updateMutation.mutate({
        current: milestone,
        update: {
          title: String(data.get('title') || '').trim(),
          body: body || null,
          happenedOn: new Date(`${happenedOn}T00:00:00Z`),
        },
      });
    }

    return (
      <StoryEditorPageShell
        before={
          <TaskBackLink
            to={milestoneDetailPath(milestone.id)}
            state={{ taskOriginKey: originKey }}
          >
            {t('milestoneProduct.backToMilestone')}
          </TaskBackLink>
        }
        title={t('milestoneProduct.editHeading')}
        sectionLabelledBy="milestone-edit-heading"
        sectionHeading={t('milestoneProduct.formAria')}
      >
        <>
          <form className="form-grid" onSubmit={submitEdit}>
            <MilestoneFields milestone={milestone} />
            <div className="form-actions">
              <Link
                className="button-link secondary-link"
                to={milestoneDetailPath(milestone.id)}
                state={{ taskOriginKey: originKey }}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey ||
                    !previousEntryIs(milestoneDetailPath(milestone.id))
                  )
                    return;
                  event.preventDefault();
                  void navigate(-1);
                }}
              >
                {t('common.cancel')}
              </Link>
              <button type="submit" disabled={updating || deleting}>
                {updating
                  ? t('milestoneProduct.saving')
                  : t('milestoneProduct.save')}
              </button>
            </div>
          </form>
          {runtime ? (
            <StoryPlanningLinks
              apiBaseUrl={runtime.apiBaseUrl}
              accessToken={runtime.accessToken}
              accountId={currentAccountId}
              spaceId={spaceId}
              contentId={milestone.id}
              sourceKind="MILESTONE"
              canManage={milestone.capabilities.canEdit && !updating}
              editing
              offline={offline}
            />
          ) : null}
          {updateMutation.error ? (
            <ProblemState error={updateMutation.error} />
          ) : null}
        </>
      </StoryEditorPageShell>
    );
  }

  const mayEdit = milestone.capabilities.canEdit && !offline;
  const mayDelete = milestone.capabilities.canDelete && !offline;
  const happenedOn = milestone.happenedOn;
  const dateLine = happenedOn
    ? `${formatDateOnly(happenedOn)} · ${formatRelativeElapsed(happenedOn, resolvedLocale())}`
    : undefined;
  // Who recorded it is background; it sits in the item menu, not the page.
  const provenance = t('milestoneProduct.provenance', {
    author: storyAuthorLabel(milestone.author, currentAccountId, nicknameFor),
    createdAt: formatCreatedAt(milestone.createdAt),
  });

  return (
    <StoryDetailPageShell
      before={
        <TaskBackButton inline onClick={() => requestReturn(originKey)} />
      }
      title={t('milestoneProduct.detailEyebrow')}
      titleAction={
        <ItemMenuTrigger
          triggerRef={menuTrigger}
          label={t('milestoneProduct.menu')}
          open={sheets.menuOpen}
          onOpen={() => sheets.show('menu')}
        />
      }
      metadata={
        <div className="detail-headline">
          <h2 className="milestone-hero-title">{milestone.title}</h2>
          <div className="milestone-hero">
            <span className="milestone-hero-icon" aria-hidden="true">
              <svg
                className="inline-icon"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z" />
              </svg>
            </span>
            {dateLine ? (
              <p className="milestone-hero-date">{dateLine}</p>
            ) : null}
          </div>
          <OccasionMark
            matches={occasionsOn(
              milestone.happenedOn,
              null,
              occasions,
              resolvedLocale(),
            )}
            revealKey={`milestone:${milestone.id}`}
          />
        </div>
      }
      offline={offline}
      pageClassName="milestone-product-page page-composer-detail"
      containerClassName="milestone-detail-container"
    >
      {milestone.body ? (
        <div className="milestone-keepsake">
          <ExpandableDescription
            text={milestone.body}
            scope={milestone.id}
            className="memory-detail-body"
          />
        </div>
      ) : (
        <ExpandableDescription
          text={t('milestoneProduct.noBody')}
          scope={milestone.id}
          className="memory-detail-body"
        />
      )}

      {runtime ? (
        <StoryPlanningLinks
          apiBaseUrl={runtime.apiBaseUrl}
          accessToken={runtime.accessToken}
          accountId={currentAccountId}
          spaceId={spaceId}
          contentId={milestone.id}
          sourceKind="MILESTONE"
          canManage={milestone.capabilities.canEdit}
          offline={offline}
        />
      ) : null}
      <CommentsPanel
        inlineComposer
        commentsApi={apis.comments}
        spaceId={spaceId}
        parentKind="milestone"
        parentId={milestone.id}
        currentAccountId={currentAccountId}
        canComment={milestone.capabilities.canComment}
        offline={offline}
      />

      <ItemMenuSheet
        open={sheets.menuOpen}
        title={t('milestoneProduct.detailEyebrow')}
        restoreFocusRef={menuTrigger}
        sheetRef={menuSheet}
        onClose={() => sheets.close('menu')}
        footnote={provenance}
      >
        {mayEdit ? (
          <ItemMenuOption
            icon="pen"
            title={t('milestoneProduct.edit')}
            onClick={() =>
              leaveItemMenu(
                menuSheet,
                () =>
                  void navigate(milestoneEditPath(milestone.id), {
                    state: { taskOriginKey: originKey },
                  }),
                sheets.closeAll,
              )
            }
          />
        ) : null}
        {mayDelete ? (
          <ItemMenuOption
            icon="trash"
            danger
            title={t('milestoneProduct.delete')}
            disabled={deleteMutation.isBlocked}
            onClick={() => {
              deleteMutation.reset();
              sheets.show('delete');
            }}
          />
        ) : null}
      </ItemMenuSheet>

      <ItemDeleteSheet
        sheetRef={deleteSheet}
        open={sheets.deleteOpen}
        title={t('milestoneProduct.deleteConfirmTitle')}
        body={t('milestoneProduct.deleteConfirmBody')}
        confirmLabel={t('milestoneProduct.deleteConfirm')}
        pendingLabel={t('milestoneProduct.deleting')}
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        restoreFocusRef={menuTrigger}
        onClose={() => sheets.close('delete')}
        onConfirm={() => deleteMutation.mutate(milestone)}
      />
    </StoryDetailPageShell>
  );
}

function MilestoneFields({ milestone }: { milestone?: MilestoneDetail }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="field-group">
        <label htmlFor="milestone-title">
          {t('milestoneProduct.titleLabel')}
        </label>
        <input
          id="milestone-title"
          name="title"
          required
          maxLength={200}
          defaultValue={milestone?.title}
          placeholder={t('milestoneProduct.titlePlaceholder')}
        />
      </div>
      <div className="field-group">
        <label htmlFor="milestone-body">
          {t('milestoneProduct.bodyLabel')}
        </label>
        <textarea
          id="milestone-body"
          name="body"
          rows={5}
          defaultValue={milestone?.body ?? ''}
          placeholder={t('milestoneProduct.bodyPlaceholder')}
        />
      </div>
      <NativeDateField
        id="milestone-date"
        name="happenedOn"
        label={t('milestoneProduct.happenedOnLabel')}
        required
        defaultValue={
          milestone ? dateInputValue(milestone.happenedOn) : undefined
        }
      />
    </>
  );
}
