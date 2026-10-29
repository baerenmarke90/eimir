import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { createReferenceApis } from '../client/referenceFlow';
import { mediaCacheScopeForClient } from '../client/authorizedMediaCache';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import { useTranslation } from '../i18n';
import {
  SensitiveMediaCheckbox,
  SensitiveMediaControl,
  SensitiveMediaCover,
  useSensitiveMediaReveals,
} from './SensitiveMedia';
import './PlanCover.css';

export function PlanCover({
  plan,
  spaceId,
  apiBaseUrl,
  accessToken,
  interactive = true,
  presentation = 'detail',
}: {
  plan: PlanDetail;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
  interactive?: boolean;
  presentation?: 'detail' | 'preview';
}) {
  const { t } = useTranslation();
  const apis = useMemo(
    () =>
      apiBaseUrl && accessToken
        ? createReferenceApis(apiBaseUrl, accessToken)
        : null,
    [apiBaseUrl, accessToken],
  );
  const cover = plan.coverAttachment;
  const variant =
    presentation === 'preview' && cover?.hasThumbnail
      ? 'thumbnail'
      : 'original';
  const [attempt, setAttempt] = useState(0);
  const scope = apis ? mediaCacheScopeForClient(apis.attachments).id : '';
  const image = useObjectUrlResource(
    `${scope}:${spaceId}:plan:${plan.id}:${variant}:${attempt}`,
    apis && cover ? cover.id : null,
    async (id, signal) => {
      if (!apis) throw new Error('Plan media API unavailable');
      return loadAuthorizedStoryImage(apis, spaceId, 'PLAN', plan.id, id, {
        signal,
        variant,
      });
    },
  );
  const reveals = useSensitiveMediaReveals(
    `${scope}:${spaceId}:${plan.id}:${cover?.id}`,
    Boolean(cover),
  );
  if (!cover) return null;
  const concealed = cover.isSensitive && !reveals.isRevealed(cover.id);
  const media = image.url ? (
    <img
      src={image.url}
      alt={concealed ? '' : plan.title}
      width={cover.width ?? undefined}
      height={cover.height ?? undefined}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="plan-cover-placeholder" role="status">
      {t(image.error ? 'm5s3.planImage.failed' : 'states.loading.title')}
      {image.error && interactive ? (
        <button
          type="button"
          className="secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t('common.retry')}
        </button>
      ) : null}
    </span>
  );
  return (
    <div
      className={`plan-cover plan-cover--${presentation}`}
      style={
        concealed
          ? {
              aspectRatio:
                cover.width && cover.height
                  ? `${cover.width} / ${cover.height}`
                  : '4 / 3',
            }
          : undefined
      }
    >
      {concealed ? <SensitiveMediaCover>{media}</SensitiveMediaCover> : media}
      {cover.isSensitive && interactive ? (
        <SensitiveMediaControl
          revealed={!concealed}
          onToggle={() => reveals.toggle(cover.id)}
          overlay
        />
      ) : null}
    </div>
  );
}

export function PlanCoverField({
  file,
  existing,
  removed,
  sensitive,
  onFile,
  onRemove,
  onSensitive,
  disabled = false,
}: {
  file: File | null;
  existing?: ReactNode;
  removed?: boolean;
  sensitive: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
  onSensitive: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="plan-cover-field">
      {preview ? (
        <div className="plan-cover">
          <img src={preview} alt={t('m5s3.planImage.label')} />
        </div>
      ) : !removed ? (
        existing
      ) : null}
      <label className="button-link secondary-link plan-cover-pick">
        {t(
          file || (!removed && existing)
            ? 'm5s3.planImage.change'
            : 'm5s3.planImage.add',
        )}
        <input
          type="file"
          accept="image/*"
          disabled={disabled}
          aria-label={`${t(file || (!removed && existing) ? 'm5s3.planImage.change' : 'm5s3.planImage.add')}: ${t('m5s3.planImage.label')}`}
          onChange={(event) => {
            const chosen = event.currentTarget.files?.[0];
            if (chosen) onFile(chosen);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {file || (!removed && existing) ? (
        <>
          <button
            type="button"
            className="tertiary"
            onClick={onRemove}
            disabled={disabled}
          >
            {t('m5s3.planImage.remove')}
          </button>
          <SensitiveMediaCheckbox
            checked={sensitive}
            onChange={onSensitive}
            disabled={disabled}
          />
        </>
      ) : null}
      <p className="field-help">{t('m5s3.planImage.help')}</p>
    </div>
  );
}
