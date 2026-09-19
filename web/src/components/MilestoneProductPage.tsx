import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { MilestoneDetail } from '../api/generated/models/MilestoneDetail';
import {
  MilestoneDetailFromJSON,
  MilestoneDetailToJSON,
} from '../api/generated/models/MilestoneDetail';
import type { MilestoneUpdate } from '../api/generated/models/MilestoneUpdate';
import {
  deleteProductReadCacheEntry,
  loadProductWithReadCache,
} from '../client/productReadCache';
import { normalizeClientError } from '../client/problemDetails';
import { useStoryViewReceipt } from '../client/storyViewReceipt';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  appRoutePath,
  milestoneDetailPath,
  milestoneEditPath,
} from '../client/routes';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  authorSummaryQueryKeys,
  invalidateStoryProjections,
} from '../client/authorSummaryConsumers';
import { localDateInputValue, openNativeDatePicker } from '../client/dateInput';
import { resolvedLocale, useTranslation } from '../i18n';
import { CommentsPanel } from './CommentsPanel';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { StoryDetailEditLink } from './StoryDetailEditLink';
import { StoryDetailPageShell } from './StoryDetailPageShell';
import {
  StoryCreatePageShell,
  StoryEditorPageShell,
} from './StoryFormPageShell';
import { storyAuthorLabel } from './storyPresentation';
import { UiState } from './UiState';

export type MilestoneProductMode = 'create' | 'detail' | 'edit';

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
}: {
  mode: MilestoneProductMode;
  apis: ReferenceApis;
  spaceId: string;
  currentAccountId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const milestoneId = params.milestoneId;
  const queryKey = authorSummaryQueryKeys.milestone(spaceId, milestoneId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const milestoneQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!milestoneId) throw new Error('Missing Milestone route parameter.');
      return loadProductWithReadCache({
        accountId: currentAccountId,
        spaceId,
        kind: 'milestone',
        resourceId: milestoneId,
        load: () => apis.milestones.getMilestone({ spaceId, milestoneId }),
        serialize: MilestoneDetailToJSON,
        deserialize: (payload) => MilestoneDetailFromJSON(payload),
      });
    },
    enabled: mode !== 'create' && Boolean(milestoneId),
    retry: false,
  });

  useStoryViewReceipt({
    apis,
    spaceId,
    kind: 'MILESTONE',
    itemId: milestoneId ?? '',
    presented: mode === 'detail' && milestoneQuery.isSuccess,
  });

  const createMutation = useMutation({
    mutationFn: async (values: {
      title: string;
      body?: string;
      happenedOn: Date;
    }) => {
      try {
        return await apis.milestones.createMilestone({
          spaceId,
          milestoneCreate: values,
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (milestone) => {
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(milestoneDetailPath(milestone.id), {
        replace: true,
        state: { saved: true },
      });
    },
  });

  const updateMutation = useMutation({
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
      navigate(milestoneDetailPath(milestone.id), { replace: true });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (milestone: MilestoneDetail) => {
      try {
        await apis.milestones.deleteMilestone({
          spaceId,
          milestoneId: milestone.id,
          ifMatch: String(milestone.version),
        });
        await deleteProductReadCacheEntry(
          currentAccountId,
          spaceId,
          'milestone',
          milestone.id,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(appRoutePath('story'), { replace: true });
    },
  });

  if (mode === 'create') {
    function submitCreate(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
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
          <PageHeader
            before={
              <Link className="back-link" to={appRoutePath('story')}>
                {t('milestoneProduct.backToStory')}
              </Link>
            }
            eyebrow={t('milestoneProduct.createEyebrow')}
            title={t('milestoneProduct.createHeading')}
            description={t('milestoneProduct.createIntro')}
            className="create-heading"
          />

        }
        labelledBy="milestone-form-heading"
      >
        <h2 id="milestone-form-heading" className="sr-only">
          {t('milestoneProduct.createHeading')}
        </h2>
        <form onSubmit={submitCreate} className="immersive-create-form">
          <div className="immersive-create-hero">
            <label htmlFor="milestone-title" className="sr-only">
              {t('milestoneProduct.titleLabel')}
            </label>
            <input
              id="milestone-title"
              name="title"
              required
              maxLength={200}
              placeholder={t('milestoneProduct.titlePlaceholder')}
              className="immersive-create-title"
            />
          </div>

          <div className="field-group">
            <label htmlFor="milestone-date">
              {t('milestoneProduct.happenedOnLabel')}
            </label>
            <input
              id="milestone-date"
              name="happenedOn"
              type="date"
              required
              defaultValue={localDateInputValue()}
              onClick={openNativeDatePicker}
            />
          </div>

          <details className="immersive-create-details">
            <summary>{t('milestoneProduct.addMoreDetails')}</summary>
            <div className="immersive-create-details-content">
              <div className="field-group">
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
          </details>

          <div className="form-actions">
            <Link
              className="button-link secondary-link"
              to={appRoutePath('story')}
            >
              {t('common.cancel')}
            </Link>
            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? t('milestoneProduct.saving')
                : t('milestoneProduct.save')}
            </button>
          </div>
        </form>
        {createMutation.error ? (
          <ProblemState error={createMutation.error} />
        ) : null}
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
  if (milestoneQuery.isLoading) {
    return <UiState kind="loading" title={t('milestoneProduct.loading')} />;
  }
  if (milestoneQuery.error) {
    return (
      <ProblemState
        error={milestoneQuery.error}
        onRetry={() => void milestoneQuery.refetch()}
      />
    );
  }
  const result = milestoneQuery.data;
  if (!result) return null;
  const milestone = result.value;
  const offline = result.source === 'cache';

  if (mode === 'edit') {
    if (!milestone.capabilities.canEdit || offline) {
      return (
        <div className="page page-reading">
          <PageHeader
            before={
              <Link
                className="back-link"
                to={milestoneDetailPath(milestone.id)}
              >
                {t('milestoneProduct.backToMilestone')}
              </Link>
            }
            eyebrow={t('milestoneProduct.editEyebrow')}
            title={t('milestoneProduct.editHeading')}
            description={t('milestoneProduct.editIntro')}
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
          <Link className="back-link" to={milestoneDetailPath(milestone.id)}>
            {t('milestoneProduct.backToMilestone')}
          </Link>
        }
        eyebrow={t('milestoneProduct.editEyebrow')}
        title={t('milestoneProduct.editHeading')}
        description={t('milestoneProduct.editIntro')}
        sectionLabelledBy="milestone-edit-heading"
        sectionHeading={t('milestoneProduct.formAria')}
      >
        <form className="form-grid" onSubmit={submitEdit}>
                    <MilestoneFields milestone={milestone} />
                    <div className="form-actions">
                      <Link
                        className="button-link secondary-link"
                        to={milestoneDetailPath(milestone.id)}
                        onClick={() => setConfirmDelete(false)}
                      >
                        {t('common.cancel')}
                      </Link>
                      <button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending
                          ? t('milestoneProduct.saving')
                          : t('milestoneProduct.save')}
                      </button>
                    </div>
                  </form>
                  {updateMutation.error ? (
                    <ProblemState error={updateMutation.error} />
                  ) : null}

                  {milestone.capabilities.canDelete && !offline ? (
                    <div style={{ marginTop: 'var(--space-8)' }}>
                      {!confirmDelete ? (
                        <button
                          type="button"
                          className="button-link danger-link"
                          onClick={() => setConfirmDelete(true)}
                        >
                          {t('milestoneProduct.delete')}
                        </button>
                      ) : (
                        <section
                          className="memory-danger-zone memory-delete-confirmation"
                          aria-label={t('milestoneProduct.delete')}
                          role="alert"
                        >
                          <div>
                            <h2>{t('milestoneProduct.deleteConfirmTitle')}</h2>
                            <p>{t('milestoneProduct.deleteConfirmBody')}</p>
                          </div>
                          <div className="memory-actions">
                            <button
                              type="button"
                              className="tertiary"
                              onClick={() => setConfirmDelete(false)}
                              disabled={deleteMutation.isPending}
                            >
                              {t('milestoneProduct.deleteCancel')}
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteMutation.mutate(milestone)}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending
                                ? t('milestoneProduct.deleting')
                                : t('milestoneProduct.deleteConfirm')}
                            </button>
                          </div>
                        </section>
                      )}
                      {deleteMutation.error ? (
                        <ProblemState error={deleteMutation.error} />
                      ) : null}
                    </div>
                  ) : null}
      </StoryEditorPageShell>
    );
  }

  const milestoneEyebrow = milestone.happenedOn
    ? `${t('milestoneProduct.detailEyebrow').toUpperCase()} · ${formatDateOnly(milestone.happenedOn)}`
    : t('milestoneProduct.detailEyebrow').toUpperCase();

  return (
    <StoryDetailPageShell
      eyebrow={milestoneEyebrow}
      title={milestone.title}
      titleAction={
        milestone.capabilities.canEdit && !offline ? (
          <StoryDetailEditLink
            to={milestoneEditPath(milestone.id)}
            label={t('milestoneProduct.edit')}
          />
        ) : undefined
      }
      offline={offline}
      containerClassName="milestone-detail-container"
    >
      <p className="memory-detail-body">
        {milestone.body || t('milestoneProduct.noBody')}
      </p>

      <CommentsPanel
        commentsApi={apis.comments}
        spaceId={spaceId}
        parentKind="milestone"
        parentId={milestone.id}
        currentAccountId={currentAccountId}
        canComment={milestone.capabilities.canComment}
        offline={offline}
      />

      <footer className="milestone-provenance-footer">
        <p>
          {t('milestoneProduct.provenance', {
            author: storyAuthorLabel(milestone.author, currentAccountId),
            createdAt: formatCreatedAt(milestone.createdAt),
          })}
        </p>
      </footer>
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
      <div className="field-group">
        <label htmlFor="milestone-date">
          {t('milestoneProduct.happenedOnLabel')}
        </label>
        <input
          id="milestone-date"
          name="happenedOn"
          type="date"
          required
          defaultValue={
            milestone ? dateInputValue(milestone.happenedOn) : undefined
          }
        />
      </div>
    </>
  );
}
