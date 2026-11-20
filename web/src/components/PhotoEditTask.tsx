import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
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
import type { PhotoCropSource } from '../client/photoCrop';
import {
  type CropHandle,
  clampTextSize,
  drawMarks,
  drawPhoto,
  emptyEdit,
  FULL_BOX,
  isUnchangedEdit,
  loadTextFonts,
  type NormalizedBox,
  type PenStroke,
  type PhotoEdit,
  panCrop,
  photoPoint,
  renderEditedPhoto,
  resizeCrop,
  TEXT_FONTS,
  TEXT_SIZE,
  type TextFontKey,
  type TextMark,
  textAt,
  textBox,
  turnEditLeft,
  turnedSize,
  zoomCrop,
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
 * stay the same in Light and Dark (`photoMark` tokens).
 */
const MARK_COLORS = ['white', 'black', 'rose', 'blue', 'yellow'] as const;
type MarkColor = (typeof MARK_COLORS)[number];

/** The token's value; canvas drawing cannot read CSS variables itself. */
function markColor(key: MarkColor): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--photo-mark-${key}`)
    .trim();
}
const HANDLES: readonly CropHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];
/** Room around the crop frame, so its handles stay grabbable. */
const STAGE_INSET_PX = 22;
/** Longest edge of the photo layer shown while cropping. */
const CROP_LAYER_MAX_EDGE = 2560;
/** Smallest crop side in view pixels while dragging a handle. */
const MIN_CROP_PX = 48;
/** Deepest zoom, relative to the photo's shorter edge. */
const MAX_ZOOM = 8;
/** Keyboard steps as fractions of the photo or the current crop. */
const KEY_STEP = 0.02;
const KEY_STEP_LARGE = 0.1;
const KEY_ZOOM = 1.25;
const WHEEL_ZOOM_SPEED = 0.002;
const TEXT_KEY_SCALE = 1.1;
/** Movement below this many view pixels is a tap, not a drag. */
const TAP_SLOP_PX = 6;

type Marks = Pick<PhotoEdit, 'strokes' | 'texts'>;
type Size = { width: number; height: number };
/** Where the turned photo sits on the crop stage, in stage pixels. */
interface StageTransform {
  scale: number;
  left: number;
  top: number;
}
type Gesture =
  | {
      kind: 'pan';
      startX: number;
      startY: number;
      crop: NormalizedBox;
      scale: number;
    }
  | {
      kind: 'pinch';
      /** Pinch centre and frame in stage pixels at the start. */
      midX: number;
      midY: number;
      distance: number;
      frame: { left: number; top: number; width: number; height: number };
      crop: NormalizedBox;
    }
  | {
      kind: 'handle';
      pointerId: number;
      handle: CropHandle;
      startX: number;
      startY: number;
      crop: NormalizedBox;
      transform: StageTransform;
      limits: NormalizedBox;
      min: Size;
    };

function fitView(aspect: number, maxWidth: number, maxHeight: number): Size {
  if (!(maxWidth > 0) || !(maxHeight > 0)) return { width: 0, height: 0 };
  const width = Math.min(maxWidth, maxHeight * aspect);
  return { width: Math.round(width), height: Math.round(width / aspect) };
}

/** The crop stage: the turned photo fitted into the area, plus the inset. */
function fitStage(turned: Size, area: Size): Size {
  const inner = fitView(
    turned.width / turned.height,
    area.width - 2 * STAGE_INSET_PX,
    area.height - 2 * STAGE_INSET_PX,
  );
  if (!(inner.width > 0)) return { width: 0, height: 0 };
  return {
    width: inner.width + 2 * STAGE_INSET_PX,
    height: inner.height + 2 * STAGE_INSET_PX,
  };
}

/** The photo placed so the crop fills the stage, centred, as photo apps do. */
function fitTransform(
  crop: NormalizedBox,
  turned: Size,
  stage: Size,
): StageTransform {
  const cropWidth = crop.width * turned.width;
  const cropHeight = crop.height * turned.height;
  const scale = Math.max(
    1e-6,
    Math.min(
      (stage.width - 2 * STAGE_INSET_PX) / cropWidth,
      (stage.height - 2 * STAGE_INSET_PX) / cropHeight,
    ),
  );
  return {
    scale,
    left: (stage.width - cropWidth * scale) / 2 - crop.x * turned.width * scale,
    top:
      (stage.height - cropHeight * scale) / 2 - crop.y * turned.height * scale,
  };
}

function frameOf(crop: NormalizedBox, turned: Size, at: StageTransform) {
  return {
    left: at.left + crop.x * turned.width * at.scale,
    top: at.top + crop.y * turned.height * at.scale,
    width: crop.width * turned.width * at.scale,
    height: crop.height * turned.height * at.scale,
  };
}

/** The deepest zoom as the smallest crop, normalized. */
function minimumCrop(turned: Size): Size {
  const side = Math.min(turned.width, turned.height) / MAX_ZOOM;
  return {
    width: Math.min(1, side / turned.width),
    height: Math.min(1, side / turned.height),
  };
}

function arrowOffset(event: ReactKeyboardEvent, step: number) {
  const dx =
    event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
  const dy =
    event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
  return dx || dy ? { dx, dy } : null;
}

/**
 * Shared edit step for photos added to a moment (#1907 G1): turn, free crop
 * with pan and pinch zoom, pen and text. Confirming hands over the rendered
 * photo with the original's metadata, or `null` when nothing changed;
 * cancelling hands over nothing.
 */
export function PhotoEditTask({
  source,
  onConfirm,
  onCancel,
  restoreFocusRef,
  replacesSaved = false,
}: {
  /** The decoded photo; `null` closes the step. Released by this component. */
  source: PhotoCropSource | null;
  onConfirm: (file: File | null) => void;
  onCancel: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** The photo is already saved; the edit replaces it when the entry is saved. */
  replacesSaved?: boolean;
}) {
  const { t } = useTranslation();
  const helpId = useId();
  const cropKeysId = useId();
  const toolsId = useId();
  const colorsId = useId();
  const fontsId = useId();
  const area = useRef<HTMLFieldSetElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cropLayer = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const liveStroke = useRef<PenStroke | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const sizing = useRef<{
    id: string;
    centerX: number;
    centerY: number;
    distance: number;
    size: number;
  } | null>(null);
  const [edit, setEdit] = useState<PhotoEdit>(emptyEdit);
  const [history, setHistory] = useState<Marks[]>([]);
  const [tool, setTool] = useState<Tool>('crop');
  const [colorKey, setColorKey] = useState<MarkColor>(MARK_COLORS[0]);
  const color = markColor(colorKey) || 'white';
  const [font, setFont] = useState<TextFontKey>(TEXT_FONTS[0].key);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<StageTransform | null>(null);
  const [interacting, setInteracting] = useState(false);
  const [fontEpoch, setFontEpoch] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [bounds, setBounds] = useState<Size>({ width: 0, height: 0 });
  // Keep the last photo through the sheet's exit so it does not blank out.
  const [shown, setShown] = useState(source);
  if (source && source !== shown) {
    setShown(source);
    setEdit(emptyEdit());
    setHistory([]);
    setTool('crop');
    setSelectedTextId(null);
    setEditingTextId(null);
    setFrozen(null);
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
  const minCrop = useMemo(() => minimumCrop(turned), [turned]);
  // The stage hugs the turned photo plus room for the handles instead of a
  // fixed letterbox, and eases to the new shape after a turn. It does not
  // follow the crop, so a handle keeps room to widen the section again.
  const stageSize = useMemo(() => fitStage(turned, bounds), [turned, bounds]);
  // Gesture handlers read the newest crop, also before React re-renders.
  const latest = useRef({ crop: edit.crop, turned, stageSize, minCrop });
  latest.current = { crop: edit.crop, turned, stageSize, minCrop };

  const setCrop = useCallback((crop: NormalizedBox) => {
    latest.current.crop = crop;
    setEdit((current) => ({ ...current, crop }));
  }, []);

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

  // Canvas text needs its typeface loaded first, or it falls back silently.
  const usedFonts = [font, ...edit.texts.map((text) => text.font)]
    .sort()
    .join(' ');
  useEffect(() => {
    let alive = true;
    void loadTextFonts(usedFonts.split(' ') as TextFontKey[]).then(() => {
      if (alive) setFontEpoch((epoch) => epoch + 1);
    });
    return () => {
      alive = false;
    };
  }, [usedFonts]);

  // ---- Crop stage: the frame stays, the photo moves and zooms under it ----
  const fitted = fitTransform(edit.crop, turned, stageSize);
  const transform = frozen ?? fitted;
  const frame = frameOf(edit.crop, turned, transform);
  const layerSize = useMemo(() => {
    const k = Math.min(
      1,
      CROP_LAYER_MAX_EDGE / Math.max(turned.width, turned.height),
    );
    return {
      width: Math.max(1, Math.round(turned.width * k)),
      height: Math.max(1, Math.round(turned.height * k)),
    };
  }, [turned]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontEpoch redraws text once its typeface has loaded.
  useEffect(() => {
    const layer = cropLayer.current;
    if (!shown || tool !== 'crop' || !layer) return;
    layer.width = layerSize.width;
    layer.height = layerSize.height;
    const context = layer.getContext('2d');
    if (!context) return;
    drawPhoto(
      context,
      shown,
      edit.turns,
      FULL_BOX,
      layerSize.width,
      layerSize.height,
    );
    drawMarks(
      context,
      edit,
      turned,
      FULL_BOX,
      layerSize.width,
      layerSize.height,
    );
  }, [shown, tool, edit.turns, edit.strokes, edit.texts, layerSize, fontEpoch]);

  // Wheel zoom needs a non-passive listener to keep the sheet from scrolling.
  useEffect(() => {
    const element = stage.current;
    if (!element || tool !== 'crop') return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = latest.current;
      const at = fitTransform(now.crop, now.turned, now.stageSize);
      const box = frameOf(now.crop, now.turned, at);
      const rect = element.getBoundingClientRect();
      setCrop(
        zoomCrop(
          now.crop,
          Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED),
          {
            x: (event.clientX - rect.left - box.left) / box.width,
            y: (event.clientY - rect.top - box.top) / box.height,
          },
          now.minCrop,
        ),
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [tool, setCrop]);

  function stagePoint(clientX: number, clientY: number) {
    const rect = stage.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }

  function beginStageGesture() {
    const [first, second] = [...pointers.current.values()];
    const { crop } = latest.current;
    const at = fitTransform(crop, turned, stageSize);
    if (first && second) {
      const mid = stagePoint(
        (first.x + second.x) / 2,
        (first.y + second.y) / 2,
      );
      gesture.current = {
        kind: 'pinch',
        midX: mid.x,
        midY: mid.y,
        distance:
          Math.hypot(first.x - second.x, first.y - second.y) || Number.EPSILON,
        frame: frameOf(crop, turned, at),
        crop,
      };
    } else if (first) {
      gesture.current = {
        kind: 'pan',
        startX: first.x,
        startY: first.y,
        crop,
        scale: at.scale,
      };
    } else {
      gesture.current = null;
    }
    setInteracting(Boolean(first));
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (rendering || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    beginStageGesture();
  }

  function onStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const current = gesture.current;
    if (current?.kind === 'pan') {
      const factor = current.scale;
      setCrop(
        panCrop(
          current.crop,
          -(event.clientX - current.startX) / (factor * turned.width),
          -(event.clientY - current.startY) / (factor * turned.height),
        ),
      );
    } else if (current?.kind === 'pinch') {
      const [first, second] = [...pointers.current.values()];
      if (!first || !second) return;
      const mid = stagePoint(
        (first.x + second.x) / 2,
        (first.y + second.y) / 2,
      );
      const zoomed = zoomCrop(
        current.crop,
        Math.hypot(first.x - second.x, first.y - second.y) / current.distance,
        {
          x: (current.midX - current.frame.left) / current.frame.width,
          y: (current.midY - current.frame.top) / current.frame.height,
        },
        minCrop,
      );
      const scale = current.frame.width / (zoomed.width * turned.width);
      setCrop(
        panCrop(
          zoomed,
          -(mid.x - current.midX) / (scale * turned.width),
          -(mid.y - current.midY) / (scale * turned.height),
        ),
      );
    }
  }

  function onStagePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    // A lifted finger of a pinch continues as a pan with the other one.
    beginStageGesture();
  }

  function handleMin(at: StageTransform): Size {
    return {
      width: Math.max(MIN_CROP_PX / (at.scale * turned.width), minCrop.width),
      height: Math.max(
        MIN_CROP_PX / (at.scale * turned.height),
        minCrop.height,
      ),
    };
  }

  function onHandlePointerDown(
    handle: CropHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
    if (rendering || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = fitted;
    const width = at.scale * turned.width;
    const height = at.scale * turned.height;
    gesture.current = {
      kind: 'handle',
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      crop: edit.crop,
      transform: at,
      // The frame stays on the stage while the photo holds still.
      limits: {
        x: -at.left / width,
        y: -at.top / height,
        width: stageSize.width / width,
        height: stageSize.height / height,
      },
      min: handleMin(at),
    };
    setFrozen(at);
    setInteracting(true);
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (current?.kind !== 'handle' || current.pointerId !== event.pointerId)
      return;
    event.stopPropagation();
    const { scale } = current.transform;
    setCrop(
      resizeCrop(
        current.crop,
        current.handle,
        (event.clientX - current.startX) / (scale * turned.width),
        (event.clientY - current.startY) / (scale * turned.height),
        current.min,
        current.limits,
      ),
    );
  }

  function onHandlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (current?.kind !== 'handle' || current.pointerId !== event.pointerId)
      return;
    event.stopPropagation();
    gesture.current = null;
    // Releasing re-centres the new frame, zooming in on the chosen section.
    setFrozen(null);
    setInteracting(false);
  }

  function onHandleKeyDown(
    handle: CropHandle,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    const offset = arrowOffset(
      event,
      event.shiftKey ? KEY_STEP_LARGE : KEY_STEP,
    );
    if (!offset) return;
    event.preventDefault();
    setCrop(
      resizeCrop(edit.crop, handle, offset.dx, offset.dy, handleMin(fitted)),
    );
  }

  function onFrameKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const zoom =
      event.key === '+' || event.key === '='
        ? KEY_ZOOM
        : event.key === '-'
          ? 1 / KEY_ZOOM
          : 0;
    if (zoom) {
      event.preventDefault();
      setCrop(zoomCrop(edit.crop, zoom, { x: 0.5, y: 0.5 }, minCrop));
      return;
    }
    const offset = arrowOffset(event, event.shiftKey ? 0.25 : 0.05);
    if (!offset) return;
    event.preventDefault();
    setCrop(
      panCrop(
        edit.crop,
        offset.dx * edit.crop.width,
        offset.dy * edit.crop.height,
      ),
    );
  }

  // ---- Draw and text view: the chosen section ----
  const box = edit.crop;
  const view = fitView(
    (box.width * turned.width) / (box.height * turned.height),
    bounds.width,
    bounds.height,
  );
  const unit =
    Math.min(turned.width, turned.height) *
    (view.width / (box.width * turned.width));

  // The photo layer only changes with the turn, the section or the size.
  const ratio =
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const pixelWidth = Math.round(view.width * ratio);
  const pixelHeight = Math.round(view.height * ratio);
  useEffect(() => {
    if (!shown || tool === 'crop' || !pixelWidth || !pixelHeight) return;
    const layer = base.current ?? document.createElement('canvas');
    base.current = layer;
    layer.width = pixelWidth;
    layer.height = pixelHeight;
    const context = layer.getContext('2d');
    if (context)
      drawPhoto(context, shown, edit.turns, box, pixelWidth, pixelHeight);
  }, [shown, tool, edit.turns, box, pixelWidth, pixelHeight]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontEpoch redraws text once its typeface has loaded.
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
  }, [edit, turned, box, pixelWidth, pixelHeight, editingTextId, fontEpoch]);

  useEffect(() => {
    if (tool === 'crop') return;
    const frameId = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(frameId);
  }, [redraw, tool]);

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

  function updateText(id: string, change: Partial<TextMark>) {
    setEdit((current) => ({
      ...current,
      texts: current.texts.map((text) =>
        text.id === id ? { ...text, ...change } : text,
      ),
    }));
  }

  function viewPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return photoPoint(
      box,
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
  }

  function addText(at: { x: number; y: number }) {
    remember();
    const mark: TextMark = {
      id: globalThis.crypto.randomUUID(),
      text: '',
      color,
      font,
      size: TEXT_SIZE,
      x: at.x,
      y: at.y,
    };
    setEdit((current) => ({ ...current, texts: [...current.texts, mark] }));
    setSelectedTextId(mark.id);
    setEditingTextId(mark.id);
  }

  function finishText() {
    if (!editingTextId) return;
    const finished = edit.texts.find((text) => text.id === editingTextId);
    if (!finished?.text.trim()) setSelectedTextId(null);
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
    const frameId = requestAnimationFrame(() => textInput.current?.focus());
    return () => cancelAnimationFrame(frameId);
  }, [editingTextId]);

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (rendering || event.button > 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = viewPoint(event);
    if (tool === 'draw') {
      liveStroke.current = { color, points: [point] };
      redraw();
      return;
    }
    const wasActive = Boolean(editingTextId || selectedTextId);
    if (editingTextId) finishText();
    const hit = textAt(edit.texts, turned, box, view.width, point);
    if (hit) {
      setSelectedTextId(hit.id);
      drag.current = {
        id: hit.id,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    } else if (wasActive) {
      // A tap next to the selected text first lets go of it.
      setSelectedTextId(null);
    } else {
      addText(point);
    }
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
    updateText(moving.id, viewPoint(event));
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

  const editingText = edit.texts.find((text) => text.id === editingTextId);
  const selectedText =
    tool === 'text'
      ? edit.texts.find((text) => text.id === selectedTextId)
      : undefined;
  const styledText = editingText ?? selectedText;

  function onResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = canvas.current?.getBoundingClientRect();
    if (rendering || event.button > 0 || !selectedText || !rect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const centerX =
      rect.left + ((selectedText.x - box.x) / box.width) * rect.width;
    const centerY =
      rect.top + ((selectedText.y - box.y) / box.height) * rect.height;
    remember();
    sizing.current = {
      id: selectedText.id,
      centerX,
      centerY,
      distance:
        Math.hypot(event.clientX - centerX, event.clientY - centerY) ||
        Number.EPSILON,
      size: selectedText.size,
    };
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = sizing.current;
    if (!current) return;
    const distance = Math.hypot(
      event.clientX - current.centerX,
      event.clientY - current.centerY,
    );
    updateText(current.id, {
      size: clampTextSize((current.size * distance) / current.distance),
    });
  }

  function onResizeKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!selectedText) return;
    const grow =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? TEXT_KEY_SCALE
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
          ? 1 / TEXT_KEY_SCALE
          : 0;
    if (!grow) return;
    event.preventDefault();
    updateText(selectedText.id, {
      size: clampTextSize(selectedText.size * grow),
    });
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

  function fontStyle(key: TextFontKey): CSSProperties {
    const entry = TEXT_FONTS.find((choice) => choice.key === key);
    return { fontFamily: entry?.family, fontWeight: entry?.weight };
  }

  const textPosition = (mark: TextMark): CSSProperties => ({
    left: `${((mark.x - box.x) / box.width) * 100}%`,
    top: `${((mark.y - box.y) / box.height) * 100}%`,
  });
  const inputStyle: CSSProperties | undefined = editingText
    ? {
        ...textPosition(editingText),
        ...fontStyle(editingText.font),
        color: editingText.color,
        fontSize: `${Math.max(12, editingText.size * unit)}px`,
        width: `${Math.max(4, editingText.text.length + 2)}ch`,
      }
    : undefined;
  const selectionSize =
    selectedText && !editingText ? textBox(selectedText, unit) : null;

  const cropStage = (
    // The stage is a pointer surface; keyboard users use the frame and handles.
    <div
      ref={stage}
      className="photo-edit-stage"
      data-interacting={interacting || undefined}
      style={{ width: stageSize.width, height: stageSize.height }}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
    >
      <canvas
        ref={cropLayer}
        className="photo-edit-layer"
        role="img"
        aria-label={t('photoEdit.preview')}
        style={{
          width: layerSize.width,
          height: layerSize.height,
          transform: `translate(${transform.left}px, ${transform.top}px) scale(${
            (transform.scale * turned.width) / layerSize.width
          })`,
        }}
      />
      <div
        className="photo-edit-frame"
        style={{
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
        }}
      >
        <button
          type="button"
          className="photo-edit-frame-move"
          aria-label={t('photoEdit.cropArea')}
          aria-describedby={cropKeysId}
          disabled={rendering}
          onKeyDown={onFrameKeyDown}
        />
        {HANDLES.map((handle) => (
          <button
            key={handle}
            type="button"
            className="photo-edit-handle"
            data-handle={handle}
            aria-label={t(`photoEdit.handles.${handle}`)}
            disabled={rendering}
            onPointerDown={(event) => onHandlePointerDown(handle, event)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            onKeyDown={(event) => onHandleKeyDown(handle, event)}
          />
        ))}
      </div>
      <span id={cropKeysId} className="sr-only">
        {t('photoEdit.cropKeys')}
      </span>
    </div>
  );

  const markView = (
    <div className="photo-edit-view">
      <canvas
        ref={canvas}
        className="photo-edit-canvas"
        data-tool={tool}
        style={{ width: view.width, height: view.height }}
        role="img"
        aria-label={t('photoEdit.preview')}
        onPointerDown={onPointerDown}
        // A tap must not move focus away from the text being written.
        onMouseDown={(event) => event.preventDefault()}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {selectedText && selectionSize ? (
        <div
          className="photo-edit-text-frame"
          style={{
            ...textPosition(selectedText),
            width: selectionSize.width,
            height: selectionSize.height,
          }}
        >
          <button
            type="button"
            className="photo-edit-text-resize"
            aria-label={t('photoEdit.resizeText')}
            disabled={rendering}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={() => {
              sizing.current = null;
            }}
            onPointerCancel={() => {
              sizing.current = null;
            }}
            onKeyDown={onResizeKeyDown}
          />
        </div>
      ) : null}
      {editingText && inputStyle ? (
        <input
          ref={textInput}
          className="photo-edit-text-input"
          style={inputStyle}
          value={editingText.text}
          aria-label={t('photoEdit.textLabel')}
          enterKeyHint="done"
          onChange={(event) =>
            updateText(editingText.id, { text: event.currentTarget.value })
          }
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
          {replacesSaved ? (
            <p className="field-help photo-edit-replaces">
              {t('photoEdit.replacesSaved')}
            </p>
          ) : null}
          <fieldset
            ref={area}
            className="photo-edit-area"
            data-primary-tab-swipe-block="true"
            data-pull-to-refresh-block="true"
            aria-label={t(`photoEdit.stage.${tool}`)}
            aria-describedby={helpId}
            style={{
              height: tool === 'crop' ? stageSize.height : view.height,
            }}
          >
            {tool === 'crop' ? cropStage : markView}
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
                  onClick={() => setEdit(turnEditLeft)}
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
                {tool === 'text' ? (
                  <fieldset className="photo-edit-fonts">
                    <legend className="sr-only">{t('photoEdit.font')}</legend>
                    {TEXT_FONTS.map((choice) => (
                      <label
                        key={choice.key}
                        className="photo-edit-font"
                        style={fontStyle(choice.key)}
                      >
                        <input
                          type="radio"
                          name={fontsId}
                          checked={(styledText?.font ?? font) === choice.key}
                          disabled={rendering}
                          onChange={() => {
                            setFont(choice.key);
                            if (styledText)
                              updateText(styledText.id, { font: choice.key });
                          }}
                        />
                        <span>{t(`photoEdit.fonts.${choice.key}`)}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <fieldset className="photo-edit-colors">
                  <legend className="sr-only">{t('photoEdit.color')}</legend>
                  {MARK_COLORS.map((choice) => (
                    <label
                      key={choice}
                      className="photo-edit-color"
                      style={
                        {
                          '--photo-edit-swatch': `var(--photo-mark-${choice})`,
                        } as CSSProperties
                      }
                    >
                      <input
                        type="radio"
                        name={colorsId}
                        checked={
                          tool === 'text' && styledText
                            ? styledText.color === markColor(choice)
                            : colorKey === choice
                        }
                        aria-label={t(`photoEdit.colors.${choice}`)}
                        disabled={rendering}
                        onChange={() => {
                          setColorKey(choice);
                          if (tool === 'text' && styledText)
                            updateText(styledText.id, {
                              color: markColor(choice) || 'white',
                            });
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
                    setSelectedTextId(null);
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
