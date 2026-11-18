import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { VideoProcessingContext } from '../client/video';
import { useTranslation } from '../i18n';
import {
  type VideoCaptureContext,
  useVideoUploadPolicy,
} from './VideoUploadAction';
import './MediaDropZone.css';

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

type Props = {
  children: ReactNode;
  disabled?: boolean;
  multiple?: boolean;
  videos?: boolean;
  pageWide?: boolean;
  onFiles: (files: readonly File[]) => void;
};

/** File intake is supplementary to the existing named, keyboard-accessible picker. */
export function MediaDropZone({
  children,
  disabled = false,
  multiple = true,
  videos = false,
  pageWide = false,
  onFiles,
}: Props) {
  const { t } = useTranslation();
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState('');
  const element = useRef<HTMLFieldSetElement>(null);
  type FileDrag = Pick<
    globalThis.DragEvent,
    'dataTransfer' | 'preventDefault' | 'stopPropagation'
  >;
  const hasFiles = (event: FileDrag) =>
    event.dataTransfer?.types.includes('Files');
  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };
  const enter = (event: FileDrag) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    if (!disabled) setDragging(true);
  };
  const leave = (event: FileDrag) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (!depth.current) setDragging(false);
  };
  const over = (event: FileDrag) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  };
  const drop = (event: FileDrag) => {
    if (!hasFiles(event) && !event.dataTransfer?.files.length) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
    if (disabled) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!multiple && files.length > 1) {
      setProblem(t('mediaDrop.single'));
      return;
    }
    const accepted = files.filter(
      (file) =>
        IMAGE_TYPES.has(file.type) ||
        (videos && ['video/mp4', 'video/quicktime'].includes(file.type)),
    );
    setProblem(
      accepted.length !== files.length
        ? t(videos ? 'mediaDrop.supportedMedia' : 'mediaDrop.supportedPhotos')
        : '',
    );
    if (accepted.length) onFiles(accepted);
  };
  useEffect(() => {
    if (!pageWide) return;
    const page = element.current?.closest<HTMLElement>('.page-composer');
    if (!page) return;
    const handlers = {
      dragenter: enter,
      dragleave: leave,
      dragover: over,
      drop,
    };
    for (const [name, handler] of Object.entries(handlers))
      page.addEventListener(name, handler as unknown as EventListener);
    return () => {
      for (const [name, handler] of Object.entries(handlers))
        page.removeEventListener(name, handler as unknown as EventListener);
    };
  });
  return (
    <fieldset
      ref={element}
      aria-label={t('mediaDrop.area')}
      className={`media-drop-zone${dragging && !disabled ? ' is-dragging' : ''}`}
      data-file-dropzone
      data-drop-label={t('composer.dropPhotos')}
      onDragEnter={pageWide ? undefined : enter}
      onDragLeave={pageWide ? undefined : leave}
      onDragOver={pageWide ? undefined : over}
      onDrop={pageWide ? undefined : drop}
    >
      {children}
      {!disabled ? (
        <p className="media-drop-hint">{t('mediaDrop.hint')}</p>
      ) : null}
      {problem ? (
        <p className="field-help field-error" role="alert">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}

export function AttachmentMediaDropZone({
  videoContext,
  ...props
}: Omit<Props, 'videos'> & { videoContext?: VideoCaptureContext }) {
  const processing = useContext(VideoProcessingContext);
  return processing && videoContext ? (
    <VideoMediaDropZone {...props} context={videoContext} />
  ) : (
    <MediaDropZone {...props} />
  );
}

function VideoMediaDropZone({
  context,
  ...props
}: Props & { context: VideoCaptureContext }) {
  const policy = useVideoUploadPolicy(context);
  return (
    <MediaDropZone
      {...props}
      disabled={props.disabled || policy.isPending}
      videos={Boolean(
        policy.data?.videoProcessingEnabled && policy.data.videoUploadAllowed,
      )}
    />
  );
}
