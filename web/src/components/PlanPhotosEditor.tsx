import { useState } from 'react';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import { mediaCacheScopeForClient } from '../client/authorizedMediaCache';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import type { PlanPhotoDraftController } from '../client/usePlanPhotoDrafts';
import { useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import { SensitiveMediaCover } from './SensitiveMedia';
import { PhotoDraftGallery } from './PhotoDraftGallery';
import { MAX_MEMORY_ATTACHMENTS } from '../client/attachmentLimits';
import './PlanPhotosEditor.css';

function SavedPhoto({
  photo,
  controller,
  spaceId,
  planId,
}: {
  photo: OrderedAttachmentSummary;
  controller: PlanPhotoDraftController;
  spaceId: string;
  planId: string;
}) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const resource = useObjectUrlResource(
    `${mediaCacheScopeForClient(controller.apis.attachments).id}:${spaceId}:PLAN:${planId}:thumbnail:${attempt}`,
    photo.id,
    (id, signal) =>
      loadAuthorizedStoryImageResource(
        controller.apis,
        spaceId,
        'PLAN',
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
}: {
  controller: PlanPhotoDraftController;
  spaceId: string;
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
  return (
    <div className="plan-photos-editor">
      <AttachmentDraftPicker
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
        showItems={false}
        disabled={disabled || !canUpload}
        attachments={{
          ...controller.uploads,
          addFiles: (files) => {
            controller.uploads.addFiles(files);
            onChange();
          },
        }}
      />
      <PhotoDraftGallery
        disabled={disabled}
        items={controller.items.map((item, index) => ({
          key: item.key,
          name:
            item.draft?.file.name ??
            t('m5s3.planImage.photoNumber', { number: index + 1 }),
          isSensitive: item.isSensitive,
          draft: item.draft,
          preview: item.isSensitive ? (
            <SensitiveMediaCover />
          ) : item.existing && planId ? (
            <SavedPhoto
              photo={item.existing}
              controller={controller}
              spaceId={spaceId}
              planId={planId}
            />
          ) : item.draft ? (
            <img src={item.draft.previewUrl} alt="" />
          ) : null,
        }))}
        onMove={(key, offset) => {
          controller.move(key, offset);
          onChange();
        }}
        onSensitive={(key, value) => {
          const item = controller.items.find((item) => item.key === key);
          if (item) {
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
    </div>
  );
}
