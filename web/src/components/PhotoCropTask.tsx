import type { PanzoomObject } from '@panzoom/panzoom';
import Panzoom from '@panzoom/panzoom/dist/panzoom.es.js';
import {
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  cropRectFromLayout,
  type PhotoCropSource,
  renderCroppedPhoto,
} from '../client/photoCrop';
import { useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PhotoCropTask.css';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.01;
const KEY_PAN_PX = 24;
const KEY_MOVES: Partial<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-KEY_PAN_PX, 0],
  ArrowRight: [KEY_PAN_PX, 0],
  ArrowUp: [0, -KEY_PAN_PX],
  ArrowDown: [0, KEY_PAN_PX],
};

/**
 * Shared crop step for avatar-shaped uploads (#1854): the user moves and zooms
 * the photo inside the round frame avatars use. Confirming hands over the
 * rendered square section; cancelling hands over nothing.
 */
export function PhotoCropTask({
  source,
  onConfirm,
  onCancel,
  restoreFocusRef,
}: {
  /** The decoded photo; `null` closes the step. Released by this component. */
  source: PhotoCropSource | null;
  onConfirm: (file: File) => void;
  onCancel: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { t, i18n } = useTranslation();
  const helpId = useId();
  const zoomId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const controller = useRef<PanzoomObject | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [rendering, setRendering] = useState(false);
  // Keep the last photo through the sheet's exit so it does not blank out.
  const [shown, setShown] = useState(source);
  if (source && source !== shown) setShown(source);

  useEffect(() => {
    if (!shown) return;
    return () => shown.release();
  }, [shown]);

  useEffect(() => {
    if (source) setRendering(false);
  }, [source]);

  useLayoutEffect(() => {
    const frame = stage.current;
    const element = photo.current;
    if (!shown || !frame || !element) return;
    setZoom(MIN_ZOOM);
    // The photo starts centred; `contain: 'outside'` keeps the frame covered.
    const centred = () => ({
      startX: -(element.offsetWidth - frame.clientWidth) / 2,
      startY: -(element.offsetHeight - frame.clientHeight) / 2,
    });
    const instance = Panzoom(element, {
      canvas: true,
      minScale: MIN_ZOOM,
      maxScale: MAX_ZOOM,
      contain: 'outside',
      animate: false,
      touchAction: 'none',
      cursor: 'grab',
      ...centred(),
    });
    controller.current = instance;
    let frameWidth = frame.clientWidth;
    const changed = () => setZoom(instance.getScale());
    const wheel = (event: WheelEvent) => instance.zoomWithWheel(event);
    // A mouse drag released outside the sheet would otherwise arrive as a
    // click on the dialog backdrop and dismiss the task.
    const swallowOutsideClick = (event: MouseEvent) => {
      if (frame.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    let disarm: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(disarm);
      document.addEventListener('click', swallowOutsideClick, true);
    };
    const release = () => {
      // The click, if any, follows the release within the same task.
      disarm = setTimeout(
        () => document.removeEventListener('click', swallowOutsideClick, true),
        0,
      );
    };
    frame.addEventListener('pointerdown', arm);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    element.addEventListener('panzoomchange', changed);
    frame.addEventListener('wheel', wheel, { passive: false });
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            // The initial observation and unrelated layout passes must not
            // discard the section the user already chose.
            if (frame.clientWidth === frameWidth) return;
            frameWidth = frame.clientWidth;
            instance.setOptions(centred());
            instance.reset({ animate: false });
          });
    resize?.observe(frame);
    return () => {
      resize?.disconnect();
      clearTimeout(disarm);
      frame.removeEventListener('pointerdown', arm);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      document.removeEventListener('click', swallowOutsideClick, true);
      element.removeEventListener('panzoomchange', changed);
      frame.removeEventListener('wheel', wheel);
      instance.destroy();
      instance.resetStyle();
      controller.current = null;
    };
  }, [shown]);

  const percent = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: 'percent' }),
    [i18n.language],
  );

  async function confirm() {
    const frame = stage.current;
    const element = photo.current;
    if (!shown || !frame || !element || rendering) return;
    setRendering(true);
    let file = shown.file;
    try {
      file = await renderCroppedPhoto(
        shown,
        cropRectFromLayout(
          element.getBoundingClientRect(),
          frame.getBoundingClientRect(),
          shown.width,
          shown.height,
        ),
      );
    } catch {
      // The photo itself is still valid: keep the upload, as on devices that
      // cannot decode it at all.
    }
    onConfirm(file);
  }

  return (
    <ShortTaskSheet
      open={source !== null}
      title={t('photoCrop.title')}
      onClose={onCancel}
      closeLabel={t('common.cancel')}
      initialFocusRef={stage}
      restoreFocusRef={restoreFocusRef}
      isCloseBlocked={rendering}
      className="photo-crop-task"
      footer={
        <div className="photo-crop-footer">
          <button
            type="button"
            className="secondary"
            disabled={rendering}
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={rendering}
            aria-busy={rendering || undefined}
            onClick={() => void confirm()}
          >
            {rendering ? t('photoCrop.confirming') : t('photoCrop.confirm')}
          </button>
        </div>
      }
    >
      {shown ? (
        <>
          <div
            ref={stage}
            className="photo-crop-stage"
            data-orientation={
              shown.width >= shown.height ? 'landscape' : 'portrait'
            }
            data-primary-tab-swipe-block="true"
            data-pull-to-refresh-block="true"
            role="application"
            aria-label={t('photoCrop.stageLabel')}
            aria-describedby={helpId}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: The crop stage owns keyboard pan and zoom, like the photo viewer.
            tabIndex={0}
            onKeyDown={(event) => {
              const instance = controller.current;
              if (!instance || event.target !== event.currentTarget) return;
              const move = KEY_MOVES[event.key];
              if (move) {
                event.preventDefault();
                instance.pan(move[0], move[1], { relative: true });
              } else if (event.key === '+' || event.key === '=') {
                event.preventDefault();
                instance.zoomIn({ animate: false });
              } else if (event.key === '-') {
                event.preventDefault();
                instance.zoomOut({ animate: false });
              } else if (event.key === '0') {
                event.preventDefault();
                instance.reset({ animate: false });
              }
            }}
          >
            <img
              ref={photo}
              className="photo-crop-photo"
              src={shown.url}
              alt=""
              draggable={false}
              style={{ aspectRatio: `${shown.width} / ${shown.height}` }}
            />
          </div>
          <div className="photo-crop-zoom">
            <label htmlFor={zoomId}>{t('photoCrop.zoom')}</label>
            <input
              id={zoomId}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={zoom}
              disabled={rendering}
              aria-valuetext={percent.format(zoom)}
              onChange={(event) => {
                // The engine applies transforms on the next frame; reflect the
                // request at once so the controlled input keeps its value.
                const requested = Number(event.currentTarget.value);
                setZoom(requested);
                controller.current?.zoom(requested, { animate: false });
              }}
            />
          </div>
          <p className="field-help photo-crop-help">{t('photoCrop.help')}</p>
          <p id={helpId} className="sr-only">
            {t('photoCrop.keyboardHelp')}
          </p>
        </>
      ) : null}
    </ShortTaskSheet>
  );
}
