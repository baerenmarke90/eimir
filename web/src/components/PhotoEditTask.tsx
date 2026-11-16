import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { PhotoCropSource } from '../client/photoCrop';
import {
  drawMarks,
  drawPhoto,
  emptyEdit,
  FULL_BOX,
  isUnchangedEdit,
  type NormalizedBox,
  type PenStroke,
  type PhotoEdit,
  photoPoint,
  renderEditedPhoto,
  TEXT_SIZE,
  type TextMark,
  textAt,
  turnEditLeft,
  turnedSize,
} from '../client/photoEdit';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PhotoCropTask.css';
import './PhotoEditTask.css';

type Tool = 'crop' | 'draw' | 'text';
const TOOLS: readonly { tool: Tool; icon: EimirIconName }[] = [
  { tool: 'crop', icon: 'crop' },
  { tool: 'draw', icon: 'pen' },
  { tool: 'text', icon: 'text' },
];
/**
 * Mark colours are content baked into the photo, not interface colour, so they
 * stay the same in Light and Dark. Prototype palette; to be tokenized.
 */
const MARK_COLORS = [
  { key: 'white', value: '#ffffff' },
  { key: 'black', value: '#1d2433' },
  { key: 'rose', value: '#e8789a' },
  { key: 'blue', value: '#3f73d1' },
  { key: 'yellow', value: '#f6c445' },
] as const;
/** Smallest crop side in view pixels; keeps the handles usable. */
const MIN_CROP_PX = 48;
/** Movement below this many view pixels is a tap, not a drag. */
const TAP_SLOP_PX = 6;

type Marks = Pick<PhotoEdit, 'strokes' | 'texts'>;

function fitView(
  aspect: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (!(maxWidth > 0) || !(maxHeight > 0)) return { width: 0, height: 0 };
  const width = Math.min(maxWidth, maxHeight * aspect);
  return { width: Math.round(width), height: Math.round(width / aspect) };
}

/**
 * Shared edit step for photos added to a moment (#1907 G1): turn, free crop,
 * pen and text. Confirming hands over the rendered photo with the original's
 * metadata, or `null` when nothing changed; cancelling hands over nothing.
 */
export function PhotoEditTask({
  source,
  onConfirm,
  onCancel,
  restoreFocusRef,
}: {
  /** The decoded photo; `null` closes the step. Released by this component. */
  source: PhotoCropSource | null;
  onConfirm: (file: File | null) => void;
  onCancel: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const helpId = useId();
  const toolsId = useId();
  const colorsId = useId();
  const area = useRef<HTMLFieldSetElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const liveStroke = useRef<PenStroke | null>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
    origin: { x: number; y: number };
  } | null>(null);
  const [edit, setEdit] = useState<PhotoEdit>(emptyEdit);
  const [history, setHistory] = useState<Marks[]>([]);
  const [tool, setTool] = useState<Tool>('crop');
  const [color, setColor] = useState<string>(MARK_COLORS[0].value);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  // Keep the last photo through the sheet's exit so it does not blank out.
  const [shown, setShown] = useState(source);
  if (source && source !== shown) {
    setShown(source);
    setEdit(emptyEdit());
    setHistory([]);
    setTool('crop');
    setEditingTextId(null);
  }

  useEffect(() => {
    if (!shown) return;
    return () => shown.release();
  }, [shown]);

  useEffect(() => {
    if (source) setRendering(false);
  }, [source]);

  const turned = useMemo(
    () =>
      shown
        ? turnedSize(shown.width, shown.height, edit.turns)
        : { width: 1, height: 1 },
    [shown, edit.turns],
  );
  // Cropping shows the whole photo; drawing and text show the chosen section.
  const box: NormalizedBox = tool === 'crop' ? FULL_BOX : edit.crop;
  const view = fitView(
    (box.width * turned.width) / (box.height * turned.height),
    bounds.width,
    bounds.height,
  );

  useLayoutEffect(() => {
    const element = area.current;
    if (!shown || !element) return;
    const measure = () =>
      setBounds({
        width: element.clientWidth,
        height: Math.min(window.innerHeight * 0.5, 34 * 16),
      });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown]);

  // The photo layer only changes with the turn, the view or the size.
  const ratio =
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const pixelWidth = Math.round(view.width * ratio);
  const pixelHeight = Math.round(view.height * ratio);
  useEffect(() => {
    if (!shown || !pixelWidth || !pixelHeight) return;
    const layer = base.current ?? document.createElement('canvas');
    base.current = layer;
    layer.width = pixelWidth;
    layer.height = pixelHeight;
    const context = layer.getContext('2d');
    if (context)
      drawPhoto(context, shown, edit.turns, box, pixelWidth, pixelHeight);
  }, [shown, edit.turns, box, pixelWidth, pixelHeight]);

  const redraw = useCallback(() => {
    const target = canvas.current;
    const layer = base.current;
    if (!target || !layer || !pixelWidth || !pixelHeight) return;
    if (target.width !== pixelWidth) target.width = pixelWidth;
    if (target.height !== pixelHeight) target.height = pixelHeight;
    const context = target.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(layer, 0, 0);
    const strokes = liveStroke.current
      ? [...edit.strokes, liveStroke.current]
      : edit.strokes;
    drawMarks(
      context,
      { strokes, texts: edit.texts },
      turned,
      box,
      pixelWidth,
      pixelHeight,
      { hiddenTextId: editingTextId ?? undefined },
    );
  }, [edit, turned, box, pixelWidth, pixelHeight, editingTextId]);

  useEffect(() => {
    const frame = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(frame);
  }, [redraw]);

  function remember() {
    setHistory((past) => [
      ...past,
      { strokes: edit.strokes, texts: edit.texts },
    ]);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setEditingTextId(null);
    setEdit((current) => ({ ...current, ...previous }));
  }

  function viewPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      clientX: event.clientX,
      clientY: event.clientY,
      point: photoPoint(
        box,
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      ),
    };
  }

  function addText(at: { x: number; y: number }) {
    remember();
    const mark: TextMark = {
      id: globalThis.crypto.randomUUID(),
      text: '',
      color,
      x: at.x,
      y: at.y,
    };
    setEdit((current) => ({ ...current, texts: [...current.texts, mark] }));
    setEditingTextId(mark.id);
  }

  function finishText() {
    if (!editingTextId) return;
    setEdit((current) => ({
      ...current,
      texts: current.texts.filter(
        (text) => text.id !== editingTextId || text.text.trim(),
      ),
    }));
    setEditingTextId(null);
  }

  useEffect(() => {
    if (!editingTextId) return;
    // After the tap that created the text has finished moving focus.
    const frame = requestAnimationFrame(() => textInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editingTextId]);

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (rendering || tool === 'crop' || event.button > 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { clientX, clientY, point } = viewPoint(event);
    if (tool === 'draw') {
      liveStroke.current = { color, points: [point] };
      redraw();
      return;
    }
    if (editingTextId) finishText();
    const context = event.currentTarget.getContext('2d');
    const hit = context
      ? textAt(
          context,
          edit.texts,
          turned,
          box,
          event.currentTarget.width,
          point,
        )
      : null;
    if (hit)
      drag.current = {
        id: hit.id,
        startX: clientX,
        startY: clientY,
        moved: false,
        origin: { x: hit.x, y: hit.y },
      };
    else if (!editingTextId) addText(point);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = liveStroke.current;
    if (stroke) {
      const events = event.nativeEvent.getCoalescedEvents?.() ?? [
        event.nativeEvent,
      ];
      const rect = event.currentTarget.getBoundingClientRect();
      for (const sample of events)
        stroke.points.push(
          photoPoint(
            box,
            (sample.clientX - rect.left) / rect.width,
            (sample.clientY - rect.top) / rect.height,
          ),
        );
      redraw();
      return;
    }
    const moving = drag.current;
    if (!moving) return;
    if (
      !moving.moved &&
      Math.hypot(event.clientX - moving.startX, event.clientY - moving.startY) <
        TAP_SLOP_PX
    )
      return;
    if (!moving.moved) remember();
    moving.moved = true;
    const { point } = viewPoint(event);
    setEdit((current) => ({
      ...current,
      texts: current.texts.map((text) =>
        text.id === moving.id ? { ...text, x: point.x, y: point.y } : text,
      ),
    }));
  }

  function onPointerUp() {
    const stroke = liveStroke.current;
    if (stroke) {
      liveStroke.current = null;
      remember();
      setEdit((current) => ({
        ...current,
        strokes: [...current.strokes, stroke],
      }));
      return;
    }
    const moving = drag.current;
    drag.current = null;
    if (moving && !moving.moved) setEditingTextId(moving.id);
  }

  async function confirm() {
    if (!shown || rendering) return;
    const final = {
      ...edit,
      texts: edit.texts.filter((text) => text.text.trim()),
    };
    if (isUnchangedEdit(final)) {
      onConfirm(null);
      return;
    }
    setRendering(true);
    let file: File | null = null;
    try {
      file = await renderEditedPhoto(shown, final);
    } catch {
      // The current photo stays valid; keep it instead of losing the moment.
    }
    onConfirm(file);
  }

  const editingText = edit.texts.find((text) => text.id === editingTextId);
  const unit =
    Math.min(turned.width, turned.height) *
    (view.width / (box.width * turned.width));
  const textStyle: CSSProperties | undefined = editingText
    ? {
        left: `${((editingText.x - box.x) / box.width) * 100}%`,
        top: `${((editingText.y - box.y) / box.height) * 100}%`,
        color: editingText.color,
        fontSize: `${Math.max(12, TEXT_SIZE * unit)}px`,
        width: `${Math.max(4, editingText.text.length + 2)}ch`,
      }
    : undefined;
  const crop: PercentCrop = {
    unit: '%',
    x: edit.crop.x * 100,
    y: edit.crop.y * 100,
    width: edit.crop.width * 100,
    height: edit.crop.height * 100,
  };
  const canvasElement = (
    <canvas
      ref={canvas}
      className="photo-edit-canvas"
      data-tool={tool}
      style={{ width: view.width, height: view.height }}
      role="img"
      aria-label={t('photoEdit.preview')}
      onPointerDown={onPointerDown}
      // A tap must not move focus away from the text being written.
      onMouseDown={(event) => {
        if (tool !== 'crop') event.preventDefault();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );

  return (
    <ShortTaskSheet
      open={source !== null}
      title={t('photoEdit.title')}
      onClose={onCancel}
      closeLabel={t('common.cancel')}
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
          <fieldset
            ref={area}
            className="photo-edit-area"
            data-primary-tab-swipe-block="true"
            data-pull-to-refresh-block="true"
            aria-label={t(`photoEdit.stage.${tool}`)}
            aria-describedby={helpId}
          >
            {tool === 'crop' ? (
              <ReactCrop
                className="photo-edit-crop"
                crop={crop}
                keepSelection
                ruleOfThirds
                minWidth={MIN_CROP_PX}
                minHeight={MIN_CROP_PX}
                disabled={rendering}
                ariaLabels={{
                  cropArea: t('photoEdit.cropArea'),
                  nwDragHandle: t('photoEdit.handles.nw'),
                  nDragHandle: t('photoEdit.handles.n'),
                  neDragHandle: t('photoEdit.handles.ne'),
                  eDragHandle: t('photoEdit.handles.e'),
                  seDragHandle: t('photoEdit.handles.se'),
                  sDragHandle: t('photoEdit.handles.s'),
                  swDragHandle: t('photoEdit.handles.sw'),
                  wDragHandle: t('photoEdit.handles.w'),
                }}
                onChange={(_, percent) =>
                  setEdit((current) => ({
                    ...current,
                    crop: {
                      x: percent.x / 100,
                      y: percent.y / 100,
                      width: percent.width / 100,
                      height: percent.height / 100,
                    },
                  }))
                }
              >
                {canvasElement}
              </ReactCrop>
            ) : (
              <div className="photo-edit-view">
                {canvasElement}
                {editingText && textStyle ? (
                  <input
                    ref={textInput}
                    className="photo-edit-text-input"
                    style={textStyle}
                    value={editingText.text}
                    aria-label={t('photoEdit.textLabel')}
                    enterKeyHint="done"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEdit((current) => ({
                        ...current,
                        texts: current.texts.map((text) =>
                          text.id === editingText.id
                            ? { ...text, text: value }
                            : text,
                        ),
                      }));
                    }}
                    onBlur={finishText}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') {
                        // Escape ends the text, not the whole edit step.
                        event.preventDefault();
                        event.stopPropagation();
                        finishText();
                      }
                    }}
                  />
                ) : null}
              </div>
            )}
          </fieldset>
          <p id={helpId} className="field-help photo-crop-help">
            {t(`photoEdit.help.${tool}`)}
          </p>
          <div className="photo-edit-context">
            {tool === 'crop' ? (
              <>
                <button
                  type="button"
                  className="secondary photo-edit-action"
                  disabled={rendering}
                  onClick={() => {
                    setEditingTextId(null);
                    setEdit(turnEditLeft);
                  }}
                >
                  <EimirIcon name="rotate" />
                  <span>{t('photoEdit.turn')}</span>
                </button>
                <button
                  type="button"
                  className="secondary photo-edit-action"
                  disabled={
                    rendering || (edit.crop === FULL_BOX && edit.turns === 0)
                  }
                  onClick={() =>
                    setEdit((current) => {
                      let next = current;
                      while (next.turns !== 0) next = turnEditLeft(next);
                      return { ...next, crop: FULL_BOX };
                    })
                  }
                >
                  <span>{t('photoEdit.reset')}</span>
                </button>
              </>
            ) : (
              <>
                <fieldset className="photo-edit-colors">
                  <legend id={colorsId} className="sr-only">
                    {t('photoEdit.color')}
                  </legend>
                  {MARK_COLORS.map((choice) => (
                    <label
                      key={choice.key}
                      className="photo-edit-color"
                      style={
                        { '--photo-edit-swatch': choice.value } as CSSProperties
                      }
                    >
                      <input
                        type="radio"
                        name={colorsId}
                        checked={color === choice.value}
                        aria-label={t(`photoEdit.colors.${choice.key}`)}
                        disabled={rendering}
                        onChange={() => {
                          setColor(choice.value);
                          if (editingText)
                            setEdit((current) => ({
                              ...current,
                              texts: current.texts.map((text) =>
                                text.id === editingText.id
                                  ? { ...text, color: choice.value }
                                  : text,
                              ),
                            }));
                        }}
                      />
                    </label>
                  ))}
                </fieldset>
                {tool === 'text' ? (
                  <button
                    type="button"
                    className="secondary photo-edit-action photo-edit-icon-action"
                    disabled={rendering}
                    aria-label={t('photoEdit.addText')}
                    onClick={() =>
                      addText({
                        x: box.x + box.width / 2,
                        y: box.y + box.height / 2,
                      })
                    }
                  >
                    <EimirIcon name="hinzufuegen" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary photo-edit-action photo-edit-icon-action"
                  disabled={rendering || !history.length}
                  aria-label={t('photoEdit.undo')}
                  onClick={undo}
                >
                  <EimirIcon name="undo" />
                </button>
              </>
            )}
          </div>
          <fieldset className="photo-edit-tools">
            <legend id={toolsId} className="sr-only">
              {t('photoEdit.tools')}
            </legend>
            {TOOLS.map((choice) => (
              <label key={choice.tool} className="photo-edit-tool">
                <input
                  type="radio"
                  name={toolsId}
                  checked={tool === choice.tool}
                  disabled={rendering}
                  onChange={() => {
                    finishText();
                    setTool(choice.tool);
                  }}
                />
                <EimirIcon name={choice.icon} />
                <span>{t(`photoEdit.toolNames.${choice.tool}`)}</span>
              </label>
            ))}
          </fieldset>
        </>
      ) : null}
    </ShortTaskSheet>
  );
}
