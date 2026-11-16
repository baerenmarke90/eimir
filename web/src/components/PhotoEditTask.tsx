import type { PanzoomObject } from '@panzoom/panzoom';
import Panzoom from '@panzoom/panzoom/dist/panzoom.es.js';
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PhotoCropSource } from '../client/photoCrop';
import {
  aspectRatio,
  editBoxFromLayout,
  isUnchangedEdit,
  type PhotoAspect,
  type QuarterTurns,
  renderEditedPhoto,
  turnedSize,
  turnLeft,
} from '../client/photoEdit';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PhotoCropTask.css';
import './PhotoEditTask.css';

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
const ASPECTS: readonly PhotoAspect[] = [
  'original',
  'square',
  'classic',
  'wide',
];

/**
 * Shared edit step for photos added to a moment (#1907 G1): choose a frame,
 * turn the photo and move/zoom it inside the frame. Confirming hands over the
 * rendered photo with the original's metadata; cancelling hands over nothing.
 */
export function PhotoEditTask({
  source,
  onConfirm,
  onCancel,
  restoreFocusRef,
}: {
  /** The decoded photo; `null` closes the step. Released by this component. */
  source: PhotoCropSource | null;
  /** `null` when nothing changed: the caller keeps the current photo. */
  onConfirm: (file: File | null) => void;
  onCancel: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { t, i18n } = useTranslation();
  const helpId = useId();
  const zoomId = useId();
  const aspectId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const turned = useRef<HTMLDivElement>(null);
  const controller = useRef<PanzoomObject | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [turns, setTurns] = useState<QuarterTurns>(0);
  const [aspect, setAspect] = useState<PhotoAspect>('original');
  const [rendering, setRendering] = useState(false);
  // Keep the last photo through the sheet's exit so it does not blank out.
  const [shown, setShown] = useState(source);
  if (source && source !== shown) {
    setShown(source);
    setTurns(0);
    setAspect('original');
  }

  useEffect(() => {
    if (!shown) return;
    return () => shown.release();
  }, [shown]);

  useEffect(() => {
    if (source) setRendering(false);
  }, [source]);

  const size = shown
    ? turnedSize(shown.width, shown.height, turns)
    : { width: 1, height: 1 };
  const ratio = aspectRatio(aspect, size.width, size.height);
  const photoRatio = size.width / size.height;

  // biome-ignore lint/correctness/useExhaustiveDependencies: The frame's size follows `ratio`; the gesture engine is rebuilt for each new frame.
  useLayoutEffect(() => {
    const frame = stage.current;
    const element = turned.current;
    if (!shown || !frame || !element) return;
    setZoom(MIN_ZOOM);
    // The turned photo covers the frame; `contain: 'outside'` keeps it covered.
    const cover = () => {
      const frameRatio = frame.clientWidth / frame.clientHeight;
      if (photoRatio > frameRatio) {
        element.style.height = `${frame.clientHeight}px`;
        element.style.width = `${frame.clientHeight * photoRatio}px`;
      } else {
        element.style.width = `${frame.clientWidth}px`;
        element.style.height = `${frame.clientWidth / photoRatio}px`;
      }
      return {
        startX: -(element.offsetWidth - frame.clientWidth) / 2,
        startY: -(element.offsetHeight - frame.clientHeight) / 2,
      };
    };
    const instance = Panzoom(element, {
      canvas: true,
      minScale: MIN_ZOOM,
      maxScale: MAX_ZOOM,
      contain: 'outside',
      animate: false,
      touchAction: 'none',
      cursor: 'grab',
      ...cover(),
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
            if (frame.clientWidth === frameWidth) return;
            frameWidth = frame.clientWidth;
            instance.setOptions(cover());
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
  }, [shown, ratio, photoRatio]);

  const percent = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: 'percent' }),
    [i18n.language],
  );

  async function confirm() {
    const frame = stage.current;
    const element = turned.current;
    if (!shown || !frame || !element || rendering) return;
    const box = editBoxFromLayout(
      element.getBoundingClientRect(),
      frame.getBoundingClientRect(),
      size.width,
      size.height,
    );
    if (isUnchangedEdit(box, turns, size.width, size.height)) {
      onConfirm(null);
      return;
    }
    setRendering(true);
    let file: File | null = null;
    try {
      file = await renderEditedPhoto(shown, turns, box);
    } catch {
      // The current photo stays valid; keep it instead of losing the moment.
    }
    onConfirm(file);
  }

  const turnedStyle: CSSProperties = {
    // The original sits centred in the turned box and is rotated into it.
    width: turns % 2 ? `${(size.height / size.width) * 100}%` : '100%',
    height: turns % 2 ? `${(size.width / size.height) * 100}%` : '100%',
    transform: `translate(-50%, -50%) rotate(${turns * 90}deg)`,
  };

  return (
    <ShortTaskSheet
      open={source !== null}
      title={t('photoEdit.title')}
      onClose={onCancel}
      closeLabel={t('common.cancel')}
      initialFocusRef={stage}
      restoreFocusRef={restoreFocusRef}
      isCloseBlocked={rendering}
      className="photo-crop-task photo-edit-task"
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
            {rendering ? t('photoEdit.confirming') : t('photoEdit.confirm')}
          </button>
        </div>
      }
    >
      {shown ? (
        <>
          <div
            ref={stage}
            className="photo-edit-stage"
            style={{ '--photo-edit-ratio': ratio } as CSSProperties}
            data-primary-tab-swipe-block="true"
            data-pull-to-refresh-block="true"
            role="application"
            aria-label={t('photoEdit.stageLabel')}
            aria-describedby={helpId}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: The edit stage owns keyboard pan and zoom, like the photo viewer.
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
            <div ref={turned} className="photo-edit-turned">
              <img
                className="photo-edit-photo"
                src={shown.url}
                alt=""
                draggable={false}
                style={turnedStyle}
              />
            </div>
          </div>
          <div className="photo-edit-tools">
            <fieldset className="photo-edit-aspects">
              <legend id={aspectId} className="sr-only">
                {t('photoEdit.aspect')}
              </legend>
              {ASPECTS.map((choice) => (
                <label key={choice} className="photo-edit-aspect">
                  <input
                    type="radio"
                    name={aspectId}
                    value={choice}
                    checked={aspect === choice}
                    disabled={rendering}
                    onChange={() => setAspect(choice)}
                  />
                  <span>
                    {t(`photoEdit.aspects.${choice}`, {
                      context:
                        size.height > size.width ? 'portrait' : undefined,
                    })}
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="secondary photo-edit-turn"
              disabled={rendering}
              onClick={() => setTurns(turnLeft)}
            >
              <EimirIcon name="rotate" />
              <span>{t('photoEdit.turn')}</span>
            </button>
          </div>
          <div className="photo-crop-zoom">
            <label htmlFor={zoomId}>{t('photoEdit.zoom')}</label>
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
                const requested = Number(event.currentTarget.value);
                setZoom(requested);
                controller.current?.zoom(requested, { animate: false });
              }}
            />
          </div>
          <p className="field-help photo-crop-help">{t('photoEdit.help')}</p>
          <p id={helpId} className="sr-only">
            {t('photoEdit.keyboardHelp')}
          </p>
        </>
      ) : null}
    </ShortTaskSheet>
  );
}
