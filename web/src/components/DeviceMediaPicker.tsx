import { type ReactNode, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { isCapacitorNativePlatform } from '../client/config';
import { VideoProcessingContext } from '../client/video';
import { useTranslation } from '../i18n';
import { MediaIntakeButton } from './MediaIntakeButton';
import { containModalTabFocus } from './useModalLifecycle';
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
  inSourceChooser?: boolean;
  intake?: boolean;
  /** When set, the intake opens the shared source sheet instead of the device picker. */
  onChooseSource?: () => void;
  renderTrigger?: (open: () => void) => ReactNode;
  actionContainer?: HTMLElement | null;
}

/** Keep the native input mounted while its action participates in the source sheet. */
function renderActions(
  props: Pick<Props, 'inSourceChooser' | 'actionContainer'>,
  children: ReactNode,
) {
  return props.inSourceChooser
    ? props.actionContainer
      ? createPortal(
          <fieldset
            className="media-device-actions"
            onKeyDown={(event) => {
              // Portaled controls keep React ancestry with their native input.
              // Reuse the sheet's key boundary before events reach that ancestry.
              if (
                event.key === 'Escape' ||
                containModalTabFocus(
                  event,
                  event.currentTarget.closest('dialog'),
                  { visibleOnly: true, wrapFromOutside: true },
                )
              )
                event.stopPropagation();
            }}
          >
            {children}
          </fieldset>,
          props.actionContainer,
        )
      : null
    : children;
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
      {renderActions(
        props,
        <>
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
        </>,
      )}
    </>
  );
}

function DeviceInput({
  id,
  multiple,
  disabled,
  videos,
  onFiles,
  inSourceChooser,
  actionContainer,
  intake = false,
  onChooseSource,
  renderTrigger,
}: Props & { videos: boolean }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`media-device-choice${inSourceChooser ? ' media-device-choice--chooser' : ''}`}
    >
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
      {renderActions(
        { inSourceChooser, actionContainer },
        renderTrigger ? (
          renderTrigger(() => input.current?.click())
        ) : (
          <MediaIntakeButton
            label={t(
              inSourceChooser
                ? 'photoSources.device'
                : intake
                  ? videos
                    ? 'composer.addMedia'
                    : 'composer.addPhotos'
                  : 'photoSources.addMedia',
            )}
            className={intake ? 'media-intake-device' : undefined}
            description={
              intake
                ? // The native app has no drag-and-drop target, so it must not
                  // promise one; browsers keep the drop hint.
                  t(
                    onChooseSource
                      ? isCapacitorNativePlatform()
                        ? 'composer.chooseSource'
                        : 'composer.chooseSourceOrDrag'
                      : isCapacitorNativePlatform()
                        ? 'composer.chooseFromDevice'
                        : 'composer.chooseOrDrag',
                  )
                : inSourceChooser && videos
                  ? t('photoSources.deviceMedia')
                  : undefined
            }
            icon="foto"
            variant={inSourceChooser || intake ? 'source' : 'entry'}
            disabled={disabled}
            aria-haspopup={onChooseSource ? 'dialog' : undefined}
            onClick={() =>
              onChooseSource ? onChooseSource() : input.current?.click()
            }
          />
        ),
      )}
    </div>
  );
}
