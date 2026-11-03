import { useQuery } from '@tanstack/react-query';
import { useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReferenceApis } from '../client/referenceFlow';
import { PRO_INFORMATION_ROUTE } from '../client/routes';
import { VideoProcessingContext } from '../client/video';
import { useTranslation } from '../i18n';
import { ProMark } from './ProMark';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

export interface VideoCaptureContext {
  apis: ReferenceApis;
  accountId: string;
  spaceId: string;
}

export function useVideoUploadPolicy(context: VideoCaptureContext) {
  return useQuery({
    queryKey: [
      'video-upload-policy',
      context.apis.attachments.contentBaseUrl,
      context.accountId,
      context.spaceId,
    ],
    queryFn: ({ signal }) =>
      context.apis.attachments.getAttachmentUploadPolicy(
        { spaceId: context.spaceId },
        { signal },
      ),
    staleTime: 60_000,
    retry: false,
  });
}

/** Separate native video intake preserves the existing original-photo consent. */
export function VideoUploadAction(props: {
  id: string;
  context: VideoCaptureContext;
  multiple: boolean;
  disabled: boolean;
  onFiles: (files: FileList) => void;
}) {
  return useContext(VideoProcessingContext) ? (
    <EnabledVideoUploadAction {...props} />
  ) : null;
}

function EnabledVideoUploadAction({
  id,
  context,
  multiple,
  disabled,
  onFiles,
}: Parameters<typeof VideoUploadAction>[0]) {
  const { t } = useTranslation();
  const [proOpen, setProOpen] = useState(false);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const navigate = useNavigate();
  const policy = useVideoUploadPolicy(context);
  if (!policy.data?.videoProcessingEnabled) return null;
  return (
    <div className="video-upload-action">
      {policy.data.videoUploadAllowed ? (
        <>
          <input
            id={`${id}-video`}
            className="visually-hidden-input"
            type="file"
            accept="video/mp4,video/quicktime"
            multiple={multiple}
            disabled={disabled}
            onChange={(event) => {
              const files = event.currentTarget.files;
              if (files?.length) onFiles(files);
              event.currentTarget.value = '';
            }}
          />
          <label className="file-picker" htmlFor={`${id}-video`}>
            <span aria-hidden="true">▶</span> {t('video.add')}
          </label>
          <small>{t('video.formats')}</small>
        </>
      ) : (
        <button
          type="button"
          className="tertiary"
          disabled={disabled}
          onClick={() => setProOpen(true)}
        >
          {t('video.add')} <ProMark label="Pro" />
        </button>
      )}
      <ShortTaskSheet
        open={proOpen}
        title={t('video.proTitle')}
        onClose={() => setProOpen(false)}
        ref={sheet}
      >
        <p>{t('video.proBody')}</p>
        <button
          type="button"
          onClick={() =>
            sheet.current?.closeForNavigation(() =>
              navigate(PRO_INFORMATION_ROUTE),
            )
          }
        >
          {t('video.proAction')}
        </button>
      </ShortTaskSheet>
    </div>
  );
}
