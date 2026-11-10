import { useContext, useRef } from 'react';
import { VideoProcessingContext } from '../client/video';
import { useTranslation } from '../i18n';
import { MediaIntakeButton } from './MediaIntakeButton';
import {
  useVideoUploadPolicy,
  type VideoCaptureContext,
  VideoUploadAction,
} from './VideoUploadAction';

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

interface Props {
  id: string;
  multiple: boolean;
  disabled: boolean;
  context?: VideoCaptureContext;
  onFiles: (files: FileList) => void;
}

/** One platform picker; video eligibility changes its allowlist, not its owner. */
export function DeviceMediaPicker(props: Props) {
  const processing = useContext(VideoProcessingContext);
  return processing && props.context ? (
    <EnabledDeviceMediaPicker {...props} context={props.context} />
  ) : (
    <DeviceInput {...props} videos={false} />
  );
}

function EnabledDeviceMediaPicker(
  props: Props & { context: VideoCaptureContext },
) {
  const { t } = useTranslation();
  const { context } = props;
  const policy = useVideoUploadPolicy(context);
  return (
    <>
      <DeviceInput
        {...props}
        disabled={props.disabled || policy.isPending}
        videos={Boolean(
          policy.data?.videoProcessingEnabled && policy.data.videoUploadAllowed,
        )}
      />
      {policy.isPending ? (
        <p role="status">{t('states.loading.title')}</p>
      ) : null}
      {policy.isError ? (
        <div role="alert">
          <p>{t('photoSources.videoAvailabilityUnavailable')}</p>
          <button
            type="button"
            className="tertiary"
            disabled={props.disabled || policy.isFetching}
            onClick={() => void policy.refetch()}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}
      {policy.data?.videoProcessingEnabled &&
      !policy.data.videoUploadAllowed ? (
        <VideoUploadAction {...props} context={context} />
      ) : null}
    </>
  );
}

function DeviceInput({
  id,
  multiple,
  disabled,
  videos,
  onFiles,
}: Props & { videos: boolean }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="media-device-choice">
      <input
        ref={input}
        tabIndex={-1}
        id={id}
        name={id}
        className="visually-hidden-input"
        type="file"
        aria-label={t(
          videos ? 'photoSources.deviceMedia' : 'memory.photoLabel',
        )}
        accept={IMAGE_TYPES + (videos ? ',video/mp4,video/quicktime' : '')}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (!disabled && files?.length) onFiles(files);
          event.currentTarget.value = '';
        }}
      />
      <MediaIntakeButton
        label={t('photoSources.addMedia')}
        icon="foto"
        description={t(
          videos ? 'photoSources.deviceMediaHint' : 'memory.photoFormats',
        )}
        disabled={disabled}
        onClick={() => input.current?.click()}
      />
    </div>
  );
}
