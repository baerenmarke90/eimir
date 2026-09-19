import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useCallback, useLayoutEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import type { HeartMomentDetail } from '../api/generated/models/HeartMomentDetail';
import {
  HeartMomentDetailFromJSON,
  HeartMomentDetailToJSON,
} from '../api/generated/models/HeartMomentDetail';
import type { HeartMomentUpdate } from '../api/generated/models/HeartMomentUpdate';
import {
  authorSummaryQueryKeys,
  invalidateStoryProjections,
} from '../client/authorSummaryConsumers';
import { invalidateDashboard } from '../client/dashboardQueries';
import { localDateInputValue, openNativeDatePicker } from '../client/dateInput';
import { normalizeClientError } from '../client/problemDetails';
import { useStoryViewReceipt } from '../client/storyViewReceipt';
import {
  deleteProductReadCacheEntry,
  loadProductWithReadCache,
} from '../client/productReadCache';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  appRoutePath,
  heartMomentDetailPath,
  heartMomentEditPath,
} from '../client/routes';
import {
  formatAttachmentDraftContextKey,
  useAttachmentDrafts,
} from '../client/useAttachmentDrafts';
import { resolvedLocale, useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import { PRODUCT_NAME } from './Brand';
import { CommentsPanel } from './CommentsPanel';
import { HeartEmotionBadge, HeartEmotionPicker } from './HeartEmotionVisual';
import { MediaGallery } from './MediaGallery';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { StoryDetailEditLink } from './StoryDetailEditLink';
import { StoryDetailPageShell } from './StoryDetailPageShell';
import {
  StoryCreatePageShell,
  StoryEditorPageShell,
} from './StoryFormPageShell';
import { storyAuthorLabel } from './storyPresentation';
import { VisibilityBadge, VisibilityGlyph } from './VisibilityBadge';
import { UiState } from './UiState';

export type HeartMomentProductMode = 'create' | 'detail' | 'edit';

type HeartEmotionValue = (typeof HeartEmotion)[keyof typeof HeartEmotion];
type ContentVisibilityValue =
  (typeof ContentVisibility)[keyof typeof ContentVisibility];

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

export function HeartMomentProductPage({
  mode,
  apis,
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
  loadAttachment,
}: {
  mode: HeartMomentProductMode;
  apis: ReferenceApis;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  loadAttachment: (
    heartMomentId: string,
    attachmentId: string,
  ) => Promise<string>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const heartMomentId = params.heartMomentId;
  const queryKey = authorSummaryQueryKeys.heartMoment(spaceId, heartMomentId);
  const contextKey = formatAttachmentDraftContextKey(currentAccountId, spaceId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [createVisibility, setCreateVisibility] =
    useState<ContentVisibilityValue>(ContentVisibility.SHARED);
  const [removeExistingPhotoState, setRemoveExistingPhotoState] = useState<{
    contextKey: string;
    remove: boolean;
  }>(() => ({
    contextKey,
    remove: false,
  }));

  const removeExistingPhoto =
    removeExistingPhotoState.contextKey === contextKey
      ? removeExistingPhotoState.remove
      : false;

  useLayoutEffect(() => {
    setRemoveExistingPhotoState((current) =>
      current.contextKey === contextKey
        ? current
        : { contextKey, remove: false },
    );
  }, [contextKey]);

  const setRemoveExistingPhoto = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      setRemoveExistingPhotoState((current) => {
        const active =
          current.contextKey === contextKey ? current.remove : false;
        const next = typeof updater === 'function' ? updater(active) : updater;
        return { contextKey, remove: next };
      });
    },
    [contextKey],
  );

  const attachments = useAttachmentDrafts({
    apis,
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId: currentAccountId,
  });

  const heartMomentQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!heartMomentId)
        throw new Error('Missing HeartMoment route parameter.');
      return loadProductWithReadCache({
        accountId: currentAccountId,
        spaceId,
        kind: 'heartMoment',
        resourceId: heartMomentId,
        load: () =>
          apis.heartMoments.getHeartMoment({ spaceId, heartMomentId }),
        serialize: HeartMomentDetailToJSON,
        deserialize: (payload) => HeartMomentDetailFromJSON(payload),
      });
    },
    enabled: mode !== 'create' && Boolean(heartMomentId),
    retry: false,
  });

  useStoryViewReceipt({
    apis,
    spaceId,
    kind: 'HEART_MOMENT',
    itemId: heartMomentId ?? '',
    presented:
      mode === 'detail' &&
      heartMomentQuery.isSuccess &&
      heartMomentQuery.data.value.visibility === 'SHARED',
  });

  const createMutation = useMutation({
    mutationFn: async (values: {
      text: string;
      emotion: HeartEmotionValue;
      happenedOn: Date;
      visibility: ContentVisibilityValue;
      attachmentId?: string;
    }) => {
      try {
        return await apis.heartMoments.createHeartMoment({
          spaceId,
          heartMomentCreate: values,
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (heartMoment) => {
      attachments.clear();
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(heartMomentDetailPath(heartMoment.id), {
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
      current: HeartMomentDetail;
      update: HeartMomentUpdate;
    }) => {
      try {
        return await apis.heartMoments.updateHeartMoment({
          spaceId,
          heartMomentId: current.id,
          ifMatch: String(current.version),
          heartMomentUpdate: update,
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
          text: update.text ?? current.text,
          emotion: update.emotion ?? current.emotion,
          happenedOn: update.happenedOn ?? current.happenedOn,
          attachment: update.attachmentId === null ? null : current.attachment,
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
    onSuccess: async (heartMoment) => {
      attachments.clear();
      setRemoveExistingPhoto(false);
      queryClient.setQueryData(queryKey, {
        value: heartMoment,
        source: 'network',
      });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        queryClient.invalidateQueries({ queryKey }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(heartMomentDetailPath(heartMoment.id), { replace: true });
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: async ({
      current,
      visibility,
    }: {
      current: HeartMomentDetail;
      visibility: ContentVisibilityValue;
    }) => {
      try {
        return await apis.heartMoments.changeHeartMomentVisibility({
          spaceId,
          heartMomentId: current.id,
          ifMatch: String(current.version),
          heartMomentVisibilityChange: { visibility },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      return { previous: queryClient.getQueryData(queryKey) };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: async (heartMoment) => {
      // Revoke the persistent snapshot synchronously, before any refetch:
      // the privacy transition must not depend on a follow-up GET succeeding,
      // and a shared HeartMoment that just became PRIVATE must not remain
      // available as a stale IndexedDB record if that refetch never lands.
      await deleteProductReadCacheEntry(
        currentAccountId,
        spaceId,
        'heartMoment',
        heartMoment.id,
      );
      queryClient.setQueryData(queryKey, {
        value: heartMoment,
        source: 'network',
      });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        queryClient.invalidateQueries({
          queryKey: ['comments', spaceId, 'heartMoment', heartMoment.id],
        }),
        queryClient.invalidateQueries({ queryKey }),
        invalidateDashboard(queryClient, spaceId),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (heartMoment: HeartMomentDetail) => {
      try {
        await apis.heartMoments.deleteHeartMoment({
          spaceId,
          heartMomentId: heartMoment.id,
          ifMatch: String(heartMoment.version),
        });
        await deleteProductReadCacheEntry(
          currentAccountId,
          spaceId,
          'heartMoment',
          heartMoment.id,
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
      if (attachments.hasPending) return;
      const data = new FormData(event.currentTarget);
      const happenedOn = String(data.get('happenedOn') || '');
      if (!happenedOn) return;
      createMutation.mutate({
        text: String(data.get('text') || '').trim(),
        emotion: String(data.get('emotion')) as HeartEmotionValue,
        happenedOn: new Date(`${happenedOn}T00:00:00Z`),
        visibility: String(data.get('visibility')) as ContentVisibilityValue,
        attachmentId: attachments.readyIds[0],
      });
    }

    return (
      <StoryCreatePageShell
        header={
          <header className="heart-moment-create-header">
                    <div className="heart-moment-create-topline">
                      <Link
                        className="back-link heart-moment-create-back"
                        to={appRoutePath('story')}
                      >
                        {t('heartMomentProduct.backToStory')}
                      </Link>
                      <span className="heart-moment-create-identity" aria-hidden="true">
                        {PRODUCT_NAME}
                      </span>
                      <span
                        className="heart-moment-create-topline-spacer"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="heart-moment-create-title-lockup">
                      <span className="heart-moment-create-heart" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <title>{t('heartMomentProduct.createHeading')}</title>
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      </span>
                      <h1 id="heart-moment-create-heading">
                        {t('heartMomentProduct.createHeading')}
                      </h1>
                      <p
                        className="heart-moment-create-privacy-summary"
                        aria-live="polite"
                      >
                        {createVisibility === ContentVisibility.PRIVATE
                          ? t('heartMomentProduct.privateHelp')
                          : t('heartMomentProduct.sharedHelp')}
                      </p>
                    </div>
                  </header>
        }
        pageClassName="heart-moment-create-page"
        cardClassName="heart-moment-create-card"
        labelledBy="heart-moment-create-heading"
      >
                  <form
                    onSubmit={submitCreate}
                    className="immersive-create-form heart-moment-create-form"
                  >
                    <div className="heart-moment-create-media">
                      <AttachmentDraftPicker
                        id="heart-moment-create-photo"
                        attachments={attachments}
                        multiple={false}
                      />
                    </div>
        
                    <div className="field-group heart-moment-create-field heart-moment-create-note">
                      <label htmlFor="heart-moment-text">
                        {t('heartMomentProduct.textLabel')}
                      </label>
                      <textarea
                        id="heart-moment-text"
                        name="text"
                        required
                        rows={4}
                        maxLength={4000}
                        placeholder={t('heartMomentProduct.textPlaceholder')}
                        className="immersive-create-title-multiline"
                      />
                    </div>
        
                    <div className="heart-moment-create-field-grid">
                      <HeartEmotionPicker
                        legend={t('heartMomentProduct.emotionLabel')}
                        idPrefix="heart-moment-create-emotion"
                        className="heart-moment-create-field heart-moment-create-emotion-picker"
                      />
        
                      <div className="field-group heart-moment-create-field heart-moment-create-date">
                        <label htmlFor="heart-moment-date">
                          {t('heartMomentProduct.happenedOnLabel')}
                        </label>
                        <input
                          id="heart-moment-date"
                          name="happenedOn"
                          type="date"
                          required
                          defaultValue={localDateInputValue()}
                          onClick={openNativeDatePicker}
                        />
                      </div>
                    </div>
        
                    <fieldset className="heart-moment-create-visibility">
                      <legend>{t('heartMomentProduct.visibilityLabel')}</legend>
                      <div className="heart-moment-create-visibility-options">
                        <label
                          className="heart-moment-create-visibility-option"
                          htmlFor="heart-moment-create-visibility-private"
                        >
                          <input
                            id="heart-moment-create-visibility-private"
                            name="visibility"
                            type="radio"
                            value={ContentVisibility.PRIVATE}
                            checked={createVisibility === ContentVisibility.PRIVATE}
                            onChange={() =>
                              setCreateVisibility(ContentVisibility.PRIVATE)
                            }
                          />
                          <span>
                            <strong>{t('heartMomentProduct.visibilityPrivate')}</strong>
                            <small>{t('heartMomentProduct.privateHelp')}</small>
                          </span>
                        </label>
                        <label
                          className="heart-moment-create-visibility-option"
                          htmlFor="heart-moment-create-visibility-shared"
                        >
                          <input
                            id="heart-moment-create-visibility-shared"
                            name="visibility"
                            type="radio"
                            value={ContentVisibility.SHARED}
                            checked={createVisibility === ContentVisibility.SHARED}
                            onChange={() =>
                              setCreateVisibility(ContentVisibility.SHARED)
                            }
                          />
                          <span>
                            <strong>{t('heartMomentProduct.visibilityShared')}</strong>
                            <small>{t('heartMomentProduct.sharedHelp')}</small>
                          </span>
                        </label>
                      </div>
                    </fieldset>
        
                    <div className="form-actions heart-moment-create-actions">
                      <button
                        type="submit"
                        disabled={createMutation.isPending || attachments.hasPending}
                      >
                        {createMutation.isPending
                          ? t('heartMomentProduct.saving')
                          : t('heartMomentProduct.save')}
                      </button>
                      <Link
                        className="button-link secondary-link"
                        to={appRoutePath('story')}
                      >
                        {t('common.cancel')}
                      </Link>
                    </div>
                  </form>
                  {createMutation.error ? (
                    <ProblemState error={createMutation.error} />
                  ) : null}
      </StoryCreatePageShell>
    );
  }

  if (!heartMomentId) {
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  }
  if (heartMomentQuery.isLoading) {
    return <UiState kind="loading" title={t('heartMomentProduct.loading')} />;
  }
  if (heartMomentQuery.error) {
    return (
      <ProblemState
        error={heartMomentQuery.error}
        onRetry={() => void heartMomentQuery.refetch()}
      />
    );
  }
  const result = heartMomentQuery.data;
  if (!result) return null;
  const heartMoment = result.value;
  const offline = result.source === 'cache';

  if (mode === 'edit') {
    if (!heartMoment.capabilities.canEdit || offline) {
      return (
        <div className="page page-reading">
          <PageHeader
            before={
              <Link
                className="back-link"
                to={heartMomentDetailPath(heartMoment.id)}
              >
                {t('heartMomentProduct.backToHeartMoment')}
              </Link>
            }
            eyebrow={t('heartMomentProduct.editEyebrow')}
            title={t('heartMomentProduct.editHeading')}
            description={t('heartMomentProduct.editIntro')}
          />
          <UiState
            kind={offline ? 'offline' : 'permission'}
            title={
              offline
                ? t('states.offline.title')
                : t('heartMomentProduct.editNotAllowedTitle')
            }
            body={
              offline
                ? t('states.offline.body')
                : t('heartMomentProduct.editNotAllowedBody')
            }
          />
        </div>
      );
    }

    function submitEdit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (attachments.hasPending) return;
      const data = new FormData(event.currentTarget);
      const happenedOn = String(data.get('happenedOn') || '');
      const replacementAttachmentId = attachments.readyIds[0];
      const update: HeartMomentUpdate = {
        text: String(data.get('text') || '').trim(),
        emotion: String(data.get('emotion')) as HeartEmotionValue,
        happenedOn: new Date(`${happenedOn}T00:00:00Z`),
      };
      if (replacementAttachmentId)
        update.attachmentId = replacementAttachmentId;
      else if (removeExistingPhoto) update.attachmentId = null;

      updateMutation.mutate({ current: heartMoment, update });
    }

    return (
      <StoryEditorPageShell
        before={
          <Link
            className="back-link"
            to={heartMomentDetailPath(heartMoment.id)}
          >
            {t('heartMomentProduct.backToHeartMoment')}
          </Link>
        }
        eyebrow={t('heartMomentProduct.editEyebrow')}
        title={t('heartMomentProduct.editHeading')}
        description={t('heartMomentProduct.editIntro')}
        sectionLabelledBy="heart-moment-edit-heading"
        sectionHeading={t('heartMomentProduct.formAria')}
      >
      <form className="form-grid" onSubmit={submitEdit}>
                  <HeartMomentFields heartMoment={heartMoment} />
                  {heartMoment.attachment && !removeExistingPhoto ? (
                    <div className="field-group">
                      <span>{t('heartMomentProduct.photoLabel')}</span>
                      <MediaGallery
                        items={[
                          {
                            id: heartMoment.attachment.id,
                            mediaType: heartMoment.attachment.mediaType,
                          },
                        ]}
                        loadMedia={(attachmentId) =>
                          loadAttachment(heartMoment.id, attachmentId)
                        }
                      />
                      <button
                        type="button"
                        className="tertiary"
                        onClick={() => setRemoveExistingPhoto(true)}
                      >
                        {t('memory.photoRemove')}
                      </button>
                    </div>
                  ) : null}
                  <AttachmentDraftPicker
                    id="heart-moment-edit-photo"
                    attachments={attachments}
                    multiple={false}
                  />
                  <div className="form-actions">
                    <Link
                      className="button-link secondary-link"
                      to={heartMomentDetailPath(heartMoment.id)}
                      onClick={() => setConfirmDelete(false)}
                    >
                      {t('common.cancel')}
                    </Link>
                    <button
                      type="submit"
                      disabled={updateMutation.isPending || attachments.hasPending}
                    >
                      {updateMutation.isPending
                        ? t('heartMomentProduct.saving')
                        : t('heartMomentProduct.save')}
                    </button>
                  </div>
                </form>
                {updateMutation.error ? (
                  <ProblemState error={updateMutation.error} />
                ) : null}
      
                {heartMoment.capabilities.canDelete && !offline ? (
                  <div style={{ marginTop: 'var(--space-8)' }}>
                    {!confirmDelete ? (
                      <button
                        type="button"
                        className="button-link danger-link"
                        onClick={() => setConfirmDelete(true)}
                      >
                        {t('heartMomentProduct.delete')}
                      </button>
                    ) : (
                      <section
                        className="memory-danger-zone memory-delete-confirmation"
                        aria-label={t('heartMomentProduct.delete')}
                        role="alert"
                      >
                        <div>
                          <h2>{t('heartMomentProduct.deleteConfirmTitle')}</h2>
                          <p>{t('heartMomentProduct.deleteConfirmBody')}</p>
                        </div>
                        <div className="memory-actions">
                          <button
                            type="button"
                            className="tertiary"
                            onClick={() => setConfirmDelete(false)}
                            disabled={deleteMutation.isPending}
                          >
                            {t('heartMomentProduct.deleteCancel')}
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => deleteMutation.mutate(heartMoment)}
                            disabled={deleteMutation.isPending}
                          >
                            {deleteMutation.isPending
                              ? t('heartMomentProduct.deleting')
                              : t('heartMomentProduct.deleteConfirm')}
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

  const shared = heartMoment.visibility === ContentVisibility.SHARED;
  const changingVisibility = visibilityMutation.isPending;

  const heartMomentEyebrow = heartMoment.happenedOn
    ? `${t('heartMomentProduct.detailEyebrow').toUpperCase()} · ${formatDateOnly(heartMoment.happenedOn)}`
    : t('heartMomentProduct.detailEyebrow').toUpperCase();

  return (
    <StoryDetailPageShell
      eyebrow={heartMomentEyebrow}
      title={heartMoment.text}
      titleAction={
        heartMoment.capabilities.canEdit && !offline ? (
          <StoryDetailEditLink
            to={heartMomentEditPath(heartMoment.id)}
            label={t('heartMomentProduct.edit')}
          />
        ) : undefined
      }
      offline={offline}
      containerClassName="heart-moment-detail-container"
      containerDataAttributes={{ 'data-heart-emotion': heartMoment.emotion }}
    >
      <div className="heart-moment-detail-emotion">
        <HeartEmotionBadge emotion={heartMoment.emotion} variant="detail" />
      </div>

      {heartMoment.attachment ? (
        <section aria-label={t('heartMomentProduct.photoLabel')}>
          <MediaGallery
            items={[
              {
                id: heartMoment.attachment.id,
                mediaType: heartMoment.attachment.mediaType,
              },
            ]}
            loadMedia={(attachmentId) =>
              loadAttachment(heartMoment.id, attachmentId)
            }
          />
        </section>
      ) : null}

      {visibilityMutation.error ? (
        <ProblemState error={visibilityMutation.error} />
      ) : null}

      {changingVisibility ? (
        <p className="muted" role="status">
          {t('heartMomentProduct.visibilityChanging')}
        </p>
      ) : shared ? (
        <CommentsPanel
          commentsApi={apis.comments}
          spaceId={spaceId}
          parentKind="heartMoment"
          parentId={heartMoment.id}
          currentAccountId={currentAccountId}
          canComment={heartMoment.capabilities.canComment}
          offline={offline}
        />
      ) : (
        <p className="muted">{t('heartMomentProduct.commentsPrivate')}</p>
      )}

      <footer className="heart-moment-provenance-footer">
        <p>
          {t('heartMomentProduct.provenanceCompact', {
            author: storyAuthorLabel(heartMoment.author, currentAccountId),
            createdAt: formatCreatedAt(heartMoment.createdAt),
          })}
        </p>
        <VisibilityBadge
          visibility={shared ? 'SPACE_SHARED' : 'OWNER_ONLY'}
          size="small"
          variant="subtle"
          compactLabel={
            shared ? t('heartMomentProduct.sharedCompact') : undefined
          }
        />
        {heartMoment.capabilities.canEdit && !offline ? (
          <button
            type="button"
            className="list-entry-icon-button tertiary heart-moment-visibility-action"
            aria-label={
              shared
                ? t('heartMomentProduct.makePrivate')
                : t('heartMomentProduct.makeShared')
            }
            title={
              shared
                ? t('heartMomentProduct.makePrivate')
                : t('heartMomentProduct.makeShared')
            }
            onClick={() =>
              visibilityMutation.mutate({
                current: heartMoment,
                visibility: shared
                  ? ContentVisibility.PRIVATE
                  : ContentVisibility.SHARED,
              })
            }
            disabled={changingVisibility}
          >
            <VisibilityGlyph
              visibility={shared ? 'OWNER_ONLY' : 'SPACE_SHARED'}
            />
          </button>
        ) : null}
      </footer>
    </StoryDetailPageShell>
  );
}

function HeartMomentFields({
  heartMoment,
}: {
  heartMoment?: HeartMomentDetail;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="field-group">
        <label htmlFor="heart-moment-text">
          {t('heartMomentProduct.textLabel')}
        </label>
        <textarea
          id="heart-moment-text"
          name="text"
          rows={5}
          required
          maxLength={4000}
          defaultValue={heartMoment?.text ?? ''}
          placeholder={t('heartMomentProduct.textPlaceholder')}
        />
      </div>
      <HeartEmotionPicker
        legend={t('heartMomentProduct.emotionLabel')}
        defaultValue={heartMoment?.emotion ?? HeartEmotion.LOVED}
        idPrefix="heart-moment-edit-emotion"
      />
      <div className="field-group">
        <label htmlFor="heart-moment-date">
          {t('heartMomentProduct.happenedOnLabel')}
        </label>
        <input
          id="heart-moment-date"
          name="happenedOn"
          type="date"
          required
          defaultValue={
            heartMoment ? dateInputValue(heartMoment.happenedOn) : undefined
          }
        />
      </div>
    </>
  );
}
