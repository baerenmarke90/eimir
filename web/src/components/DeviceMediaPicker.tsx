import { useContext } from 'react';
import { VideoProcessingContext } from '../client/video';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import {
  VideoUploadAction,
  type VideoCaptureContext,
  useVideoUploadPolicy,
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
  const { context } = props;
  const policy = useVideoUploadPolicy(context);
  return (
    <>
      <DeviceInput
        {...props}
        videos={Boolean(
          policy.data?.videoProcessingEnabled && policy.data.videoUploadAllowed,
        )}
      />
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
  return (
    <div className="media-device-choice">
      <input
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
      <label className="file-picker" htmlFor={id}>
        <EimirIcon name="foto" />
        <span>
          <strong>{t('photoSources.device')}</strong>
          <small>
            {t(videos ? 'photoSources.deviceMedia' : 'memory.photoFormats')}
          </small>
        </span>
      </label>
    </div>
  );
}
