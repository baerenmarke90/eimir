import { useState } from 'react';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import { mediaCacheScopeForClient } from '../client/authorizedMediaCache';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import type { PlanPhotoDraftController } from '../client/usePlanPhotoDrafts';
import { useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import { SensitiveMediaCheckbox, SensitiveMediaCover } from './SensitiveMedia';
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
      loadAuthorizedStoryImage(controller.apis, spaceId, 'PLAN', planId, id, {
        signal,
        variant: photo.hasThumbnail ? 'thumbnail' : 'original',
      }),
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
}: {
  controller: PlanPhotoDraftController;
  spaceId: string;
  planId?: string;
  disabled: boolean;
  canUpload: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [announcement, setAnnouncement] = useState('');
  return (
    <div className="plan-photos-editor">
      <AttachmentDraftPicker
        id="plan-photos"
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
      <p className="field-help">{t('m5s3.planImage.galleryHelp')}</p>
      {controller.hasPending || controller.hasFailed ? (
        <p role="status">
          {t(
            controller.hasFailed
              ? 'm5s3.planImage.fixUploads'
              : 'm5s3.planImage.waitUploads',
          )}
        </p>
      ) : null}
      {controller.items.length ? (
        <ol
          className="plan-photo-drafts"
          aria-label={t('memory.photoDraftsAria')}
        >
          {controller.items.map((item, index) => {
            const name =
              item.draft?.file.name ??
              t('m5s3.planImage.photoNumber', { number: index + 1 });
            const failed = item.draft?.status === 'failed';
            return (
              <li key={item.key} className="plan-photo-draft">
                <div className="plan-photo-draft-preview">
                  {item.isSensitive ? (
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
                  ) : null}
                </div>
                <span className="plan-photo-draft-label">
                  {name}
                  {index === 0 ? (
                    <small>{t('m5s3.planImage.leading')}</small>
                  ) : null}
                </span>
                <SensitiveMediaCheckbox
                  checked={item.isSensitive}
                  disabled={disabled}
                  onChange={(value) => {
                    controller.setSensitive(item, value);
                    onChange();
                  }}
                />
                {item.draft ? (
                  <span role={failed ? 'alert' : 'status'}>
                    {t(
                      item.draft.status === 'ready'
                        ? 'memory.photoReady'
                        : item.draft.status === 'validating'
                          ? 'memory.photoValidating'
                          : failed
                            ? 'memory.photoFailed'
                            : 'memory.photoUploading',
                    )}
                    {failed ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (item.draft) controller.uploads.retry(item.draft);
                        }}
                      >
                        {t('common.retry')}
                      </button>
                    ) : null}
                  </span>
                ) : null}
                <div className="plan-photo-draft-actions">
                  {([-1, 1] as const).map((offset) => (
                    <button
                      key={offset}
                      type="button"
                      className="tertiary"
                      disabled={
                        disabled ||
                        index + offset < 0 ||
                        index + offset >= controller.items.length
                      }
                      aria-label={t(
                        offset < 0
                          ? 'memory.photoMoveEarlier'
                          : 'memory.photoMoveLater',
                        { name },
                      )}
                      onClick={() => {
                        controller.move(item.key, offset);
                        onChange();
                        setAnnouncement(
                          t('memory.photoMoved', {
                            name,
                            position: index + offset + 1,
                            count: controller.items.length,
                          }),
                        );
                      }}
                    >
                      {t(
                        offset < 0
                          ? 'memory.photoEarlier'
                          : 'memory.photoLater',
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="tertiary"
                    disabled={disabled}
                    aria-label={t('m5s3.planImage.removePhoto', { name })}
                    onClick={() => {
                      controller.remove(item);
                      onChange();
                    }}
                  >
                    {t('memory.photoRemove')}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
