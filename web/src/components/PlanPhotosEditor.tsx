import { MediaProcessingState } from './MediaProcessingState';
import { useRef, useState, type ReactNode } from 'react';
import { EimirIcon } from './EimirIcon';
import { loadVideoSource } from '../client/video';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import { MAX_MEMORY_ATTACHMENTS } from '../client/attachmentLimits';
import { mediaCacheScopeForClient } from '../client/authorizedMediaCache';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import type { PlanPhotoDraftController } from '../client/usePlanPhotoDrafts';
import { useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import { DraftMediaPreview } from './DraftMediaPreview';
import { PhotoDraftGallery } from './PhotoDraftGallery';
import { SensitiveMediaCover } from './SensitiveMedia';
import './PlanPhotosEditor.css';

function SavedPhoto({
  photo,
  controller,
  spaceId,
  planId,
  parentType,
}: {
  photo: OrderedAttachmentSummary;
  controller: PlanPhotoDraftController;
  spaceId: string;
  planId: string;
  parentType: 'PLAN' | 'HEART_MOMENT';
}) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const resource = useObjectUrlResource(
    `${mediaCacheScopeForClient(controller.apis.attachments).id}:${spaceId}:${parentType}:${planId}:thumbnail:${attempt}`,
    photo.id,
    (id, signal) =>
      loadAuthorizedStoryImageResource(
        controller.apis,
        spaceId,
        parentType,
        planId,
        id,
        {
          signal,
          variant: photo.hasThumbnail ? 'thumbnail' : 'original',
        },
      ),
  );
  if (resource.url) return <img src={resource.url} alt="" />;
  return (
    <span role="status">
      {t(resource.error ? 'm5s3.planImage.failed' : 'states.loading.title')}
      {resource.error ? (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          {t('common.retry')}
        </button>
      ) : null}
    </span>
  );
}

export function PlanPhotosEditor({
  controller,
  spaceId,
  planId,
  disabled,
  canUpload,
  onChange,
  photoSourceContext,
  parentType = 'PLAN',
  canManageExisting = true,
  additionalActions,
  presentation,
  mediaTrigger,
  pageWideDrop,
}: {
  presentation?: 'diary' | 'tools';
  mediaTrigger?: (open: () => void) => ReactNode;
  pageWideDrop?: boolean;
  additionalActions?: ReactNode;
  controller: PlanPhotoDraftController;
  spaceId: string;
  parentType?: 'PLAN' | 'HEART_MOMENT';
  canManageExisting?: boolean;
  planId?: string;
  disabled: boolean;
  canUpload: boolean;
  onChange: () => void;
  photoSourceContext?: {
    apiBaseUrl: string;
    accessToken: string;
    accountId: string;
  };
}) {
  const { t } = useTranslation();
  const openSource = useRef<() => void>(() => {});
  return (
    <div
      className="plan-photos-editor"
      data-has-media={Boolean(controller.items.length)}
    >
      <AttachmentDraftPicker
        presentation={presentation}
        mediaTrigger={
          presentation
            ? (open) => {
                openSource.current = open;
                return mediaTrigger?.(open);
              }
            : undefined
        }
        pageWideDrop={pageWideDrop}
        additionalActions={additionalActions}
        id="plan-photos"
        sourceContext={
          photoSourceContext
            ? {
                ...photoSourceContext,
                spaceId,
                remaining: Math.max(
                  0,
                  MAX_MEMORY_ATTACHMENTS - controller.items.length,
                ),
                beginSelection: () => {
                  const ticket = controller.uploads.beginSelection();
                  return {
                    ...ticket,
                    commit: (files) => {
                      const accepted = ticket.commit(files);
                      if (accepted) onChange();
                      return accepted;
                    },
                  };
                },
              }
            : undefined
        }
        gallery={
          controller.items.length ? (
            <PhotoDraftGallery
              addAction={
                presentation ? (
                  <button
                    type="button"
                    className="photo-draft-add"
                    aria-label={t('photoSources.addMedia')}
                    disabled={disabled || !canUpload}
                    onClick={() => openSource.current()}
                  >
                    <EimirIcon name="hinzufuegen" />
                  </button>
                ) : undefined
              }
              key={JSON.stringify([
                photoSourceContext?.apiBaseUrl,
                photoSourceContext?.accountId,
                spaceId,
                parentType,
                planId,
              ])}
              resourceScopeKey={JSON.stringify([
                'editor',
                photoSourceContext?.apiBaseUrl,
                photoSourceContext?.accountId,
                spaceId,
                parentType,
                planId,
              ])}
              disabled={disabled}
              items={controller.items.map((item, index) => ({
                key: item.key,
                name:
                  item.draft?.file.name ??
                  t('m5s3.planImage.photoNumber', { number: index + 1 }),
                isSensitive: item.isSensitive,
                draft: item.draft,
                loadMedia:
                  item.existing && planId
                    ? (signal) =>
                        loadAuthorizedStoryImageResource(
                          controller.apis,
                          spaceId,
                          parentType,
                          planId,
                          item.existing!.id,
                          { signal },
                        )
                    : undefined,
                loadPoster:
                  item.existing && planId
                    ? (signal) =>
                        loadAuthorizedStoryImageResource(
                          controller.apis,
                          spaceId,
                          parentType,
                          planId,
                          item.existing!.id,
                          { signal, variant: 'thumbnail' },
                        )
                    : undefined,
                loadPlayback:
                  item.existing && planId && parentType === 'HEART_MOMENT'
                    ? (signal) =>
                        loadVideoSource(
                          controller.apis,
                          spaceId,
                          'HEART_MOMENT',
                          planId,
                          item.existing!.id,
                          signal,
                        )
                    : undefined,
                mediaType: item.existing?.mediaType,
                status: item.existing?.status,
                canRemove: !item.existing || canManageExisting,
                canEditSensitivity:
                  !item.existing ||
                  (item.existing.canEditSensitivity ?? canManageExisting),
                preview:
                  item.existing && item.existing.status !== 'READY' ? (
                    <MediaProcessingState
                      status={item.existing.status}
                      compact
                    />
                  ) : item.isSensitive ? (
                    <SensitiveMediaCover />
                  ) : item.existing && planId ? (
                    <SavedPhoto
                      photo={item.existing}
                      controller={controller}
                      spaceId={spaceId}
                      planId={planId}
                      parentType={parentType}
                    />
                  ) : item.draft ? (
                    <DraftMediaPreview
                      draft={item.draft}
                      blurSensitivePreview={Boolean(presentation)}
                      context={
                        photoSourceContext
                          ? {
                              apis: controller.apis,
                              spaceId,
                              accountId: photoSourceContext.accountId,
                            }
                          : undefined
                      }
                    />
                  ) : null,
              }))}
              selectedCoverKey={controller.selectedCoverKey}
              onSelectCover={(key) => {
                controller.selectCover(key);
                onChange();
              }}
              onOrderChange={(keys) => {
                controller.reorder(keys);
                onChange();
              }}
              onSensitive={(key, value) => {
                const item = controller.items.find((item) => item.key === key);
                if (
                  item &&
                  (!item.existing ||
                    (item.existing.canEditSensitivity ?? canManageExisting))
                ) {
                  controller.setSensitive(item, value);
                  onChange();
                }
              }}
              onRemove={(key) => {
                const item = controller.items.find((item) => item.key === key);
                if (item) {
                  controller.remove(item);
                  onChange();
                }
              }}
              onRetry={(key) => {
                const draft = controller.items.find(
                  (item) => item.key === key,
                )?.draft;
                if (draft) controller.uploads.retry(draft);
              }}
            />
          ) : undefined
        }
        showItems={false}
        videoContext={
          parentType === 'HEART_MOMENT' && photoSourceContext
            ? {
                apis: controller.apis,
                spaceId,
                accountId: photoSourceContext.accountId,
              }
            : undefined
        }
        disabled={disabled || !canUpload}
        attachments={{
          ...controller.uploads,
          addFiles: (files) => {
            controller.uploads.addFiles(files);
            onChange();
          },
        }}
      />
    </div>
  );
}
