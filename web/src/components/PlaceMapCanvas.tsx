import {
  type ErrorEvent,
  type IControl,
  LngLatBounds,
  MapLibreMap,
  type MapMouseEvent,
  Marker,
  type RequestTransformFunction,
  type StyleSpecification,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { framingPoints } from '../client/mapFraming';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from '../i18n';
import {
  prefersReducedMotion,
  subscribeReducedMotion,
} from '../motion/reducedMotion';
import { durationMs } from '../motion/tokens';
import { observeVisibility } from '../motion/visibility';
import { isCapacitorNative } from '../pwa';
import '../motion/map.css';
import './PlaceMapPicker.css';
import {
  cachedBasemapStyle,
  forgetBasemapStyle,
  refreshBasemapStyle,
} from '../client/basemapStyleCache';
import { ConnectionOverlay, type MapConnection } from './placeMapConnection';
import { googleLikeStyle, withLocalizedAttribution } from './placeMapStyle';

export type { MapConnection } from './placeMapConnection';

// The CSP forbids blob workers, so MapLibre runs its first-party worker file.
setWorkerUrl(workerUrl);

/** Keyless vector style built from OpenStreetMap data; see docs/DEPENDENCIES.md. */
const MAP_ORIGIN = 'https://tiles.openfreemap.org';
const MAP_STYLE_URL = `${MAP_ORIGIN}/styles/liberty`;

// Native WebViews do not register the browser map service worker. Reuse the
// HTTP cache for versioned public tiles, the versioned sprite sheet and the
// font glyphs (#2063), while style and TileJSON can advance to the next tile
// set under their normal HTTP freshness rules.
const CACHED_RESOURCES = new Set([
  'Tile',
  'SpriteJSON',
  'SpriteImage',
  'Glyphs',
]);
const cacheNativeTiles: RequestTransformFunction = (url, resourceType) =>
  resourceType &&
  CACHED_RESOURCES.has(resourceType) &&
  url.startsWith(`${MAP_ORIGIN}/`)
    ? { url, cache: 'force-cache' }
    : undefined;
/** Missing tiles from a stored style before it is replaced. */
const STORED_STYLE_MISSING_TILES = 3;

/**
 * Camera zoom values exchanged with callers use the 256 px raster-tile scale
 * the app started with. MapLibre counts 512 px vector tiles, one level lower.
 */
const ZOOM_OFFSET = 1;
const toMapZoom = (zoom: number) => zoom - ZOOM_OFFSET;
const fromMapZoom = (zoom: number) => zoom + ZOOM_OFFSET;
const MAX_ZOOM = 19;
/** MapLibre keeps 5 by default; zoom-heavy browsing benefits from more. */
const TILE_CACHE_ZOOM_LEVELS = 8;
const PLACE_ZOOM = 15;
const OVERVIEW_MAX_ZOOM = 12;
const MARKER_KEYS = ['Enter', ' '];
/** The connection starts at the latest this long after it was placed. */
const MAP_READY_FALLBACK_MS = 2500;

/** The longest the map waits for marker photos after its view has drawn. */
const MAP_REVEAL_PHOTO_WAIT_MS = 1_200;
/** The longest the map waits for those photos to decode. */
const MAP_REVEAL_DECODE_WAIT_MS = 200;
/** The map shows by then even when its basemap is slow or failing. */
const MAP_REVEAL_CAP_MS = 4_000;

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapViewport extends MapPoint {
  zoom: number;
}

export interface MapLocation extends MapPoint {
  id: string;
  label: string;
  count: number;
  preview?: ReactNode;
}

/**
 * An approximate area, not a pin (#1792): a circle of at least the disclosed
 * radius with an optional decorative marker in its centre. Areas frame the
 * map as they arrive, until the viewer takes over the camera.
 */
export interface MapArea extends MapPoint {
  id: string;
  radiusMeters: number;
  marker?: ReactNode;
  tone: 'partner' | 'own';
  /**
   * With `onAreaSelect`, the marker becomes a button with this accessible
   * name; only the marker, never the area around it, takes the tap.
   */
  selectLabel?: string;
}

/**
 * A camera target: a Place at the Place zoom, or an area framed by its
 * radius (#2158). A new `request` flies there again after the viewer moved.
 */
export interface MapFocus extends MapPoint {
  radiusMeters?: number;
  request?: number;
}

const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const VECTOR_TILE_SIZE = 512;
const METERS_PER_DEGREE_LATITUDE = 111_320;
/** Keeps area avatars clear of the edges and of a top-right map tool. */
const AREA_PADDING = { top: 88, right: 56, bottom: 56, left: 56 };

/**
 * A far-out camera never shrinks an area below a visible halo around its
 * marker; that only ever looks coarser than the disclosed radius.
 */
const MIN_AREA_DIAMETER_PX = 76;

/** On-screen diameter of a ground radius at the current camera. */
function areaDiameterPx(map: MapLibreMap, area: MapArea): number {
  if (area.radiusMeters <= 0) return 0;
  const metersPerPixel =
    (EARTH_CIRCUMFERENCE_M * Math.cos((area.latitude * Math.PI) / 180)) /
    (VECTOR_TILE_SIZE * 2 ** map.getZoom());
  return Math.max(
    MIN_AREA_DIAMETER_PX,
    (2 * area.radiusMeters) / metersPerPixel,
  );
}

function areaBounds(
  areas: readonly (MapPoint & { radiusMeters: number })[],
): LngLatBounds | null {
  if (!areas.length) return null;
  const bounds = new LngLatBounds();
  for (const area of areas) {
    const dLat = area.radiusMeters / METERS_PER_DEGREE_LATITUDE;
    const dLng =
      area.radiusMeters /
      (METERS_PER_DEGREE_LATITUDE *
        Math.max(0.01, Math.cos((area.latitude * Math.PI) / 180)));
    bounds.extend([area.longitude - dLng, area.latitude - dLat]);
    bounds.extend([area.longitude + dLng, area.latitude + dLat]);
  }
  return bounds;
}

/** How long overlaid map tools stay hidden after the last gesture. */
const USER_MOTION_REST_MS = 1500;

type LngLat = [number, number];
const lngLat = (point: MapPoint): LngLat => [point.longitude, point.latitude];

/** Where a focus puts the camera: an area fills the view, a Place zooms in. */
function focusCamera(map: MapLibreMap, focus: MapFocus) {
  const place = { center: lngLat(focus), zoom: toMapZoom(PLACE_ZOOM) };
  const radiusMeters = focus.radiusMeters ?? 0;
  if (radiusMeters <= 0) return place;
  const target = areaBounds([{ ...focus, radiusMeters }]);
  const camera =
    target &&
    map.cameraForBounds(target, {
      padding: AREA_PADDING,
      maxZoom: toMapZoom(PLACE_ZOOM),
    });
  return camera?.center && camera.zoom != null
    ? { center: camera.center, zoom: camera.zoom }
    : place;
}

/*
 * The Map domain (Motion Contract 4.8). MapLibre renders and animates the
 * camera itself; these read its durations through the token adapter and the
 * one reduced-motion source (M1, M9). A `0` duration means a jump.
 */

/** An explicit camera journey (a Place, "show us", clearing the selection). */
const cameraJourneyMs = () =>
  prefersReducedMotion() ? 0 : durationMs('map-camera');

/** One step of the zoom buttons. */
const zoomStepMs = () =>
  prefersReducedMotion() ? 0 : durationMs('transition');

type PanInertia = Parameters<MapLibreMap['dragPan']['enable']>[0];

/**
 * The pan follows the finger 1:1 either way; with reduced motion it stops
 * where the finger lifts instead of gliding on. Everyone else keeps
 * MapLibre's own inertia (its default options).
 */
const panInertia = (): PanInertia =>
  prefersReducedMotion() ? { maxSpeed: 0 } : undefined;

/** Zoom buttons with localized names; MapLibre's stock control needs data: images. */
class ZoomControl implements IControl {
  private group?: HTMLElement;
  private map?: MapLibreMap;
  private buttons: HTMLButtonElement[] = [];

  constructor(private labels: { zoomIn: string; zoomOut: string }) {}

  onAdd(map: MapLibreMap) {
    this.map = map;
    const group = document.createElement('div');
    group.className = 'maplibregl-ctrl maplibregl-ctrl-group place-map-zoom';
    const make = (kind: 'in' | 'out', glyph: string, label: string) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `place-map-zoom-${kind}`;
      button.textContent = glyph;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => {
        // Gesture follow's non-gesture alternative (4.6, 4.8): one step with
        // the transition role, or a jump with reduced motion.
        const duration = zoomStepMs();
        const options = duration ? { duration } : { animate: false };
        if (kind === 'in') map.zoomIn(options);
        else map.zoomOut(options);
      });
      group.append(button);
      return button;
    };
    this.buttons = [
      make('in', '+', this.labels.zoomIn),
      make('out', '−', this.labels.zoomOut),
    ];
    map.on('zoom', this.sync);
    this.group = group;
    this.sync();
    return group;
  }

  onRemove() {
    this.map?.off('zoom', this.sync);
    this.group?.remove();
    this.map = undefined;
  }

  private sync = () => {
    if (!this.map) return;
    const zoom = this.map.getZoom();
    this.buttons[0].disabled = zoom >= this.map.getMaxZoom();
    this.buttons[1].disabled = zoom <= this.map.getMinZoom();
  };
}

export default function PlaceMapCanvas({
  value,
  focus,
  onSelect,
  locations,
  onLocationSelect,
  initialViewport,
  onViewportChange,
  onUserMotionChange,
  onAreaSelect,
  areas,
  showAreasRequest = 0,
  connection,
  ariaLabel,
  revealWhenComplete = false,
}: {
  value?: MapPoint;
  focus?: MapFocus;
  onSelect?: (point: MapPoint) => void;
  locations?: readonly MapLocation[];
  onLocationSelect?: (id: string) => void;
  /** Called when the viewer taps the marker of an area with a `selectLabel`. */
  onAreaSelect?: (id: string) => void;
  initialViewport?: MapViewport;
  onViewportChange?: (viewport: MapViewport) => void;
  /** True while the viewer pans or zooms, and for a moment after they stop. */
  onUserMotionChange?: (moving: boolean) => void;
  areas?: readonly MapArea[];
  /** Increment to frame all areas again (an explicit "show us"). */
  showAreasRequest?: number;
  /** A decorative connection between two of the areas (#1907 H1). */
  connection?: MapConnection;
  ariaLabel?: string;
  /**
   * Shows the map in one piece (#2063): the basemap and the marker photos
   * appear together, once both are ready, instead of building up in front of
   * the viewer. A cap keeps a slow or failing basemap from hiding it.
   */
  revealWhenComplete?: boolean;
}) {
  const { t } = useTranslation();
  const [complete, setComplete] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const locationSelectRef = useRef(onLocationSelect);
  locationSelectRef.current = onLocationSelect;
  const areaSelectRef = useRef(onAreaSelect);
  areaSelectRef.current = onAreaSelect;
  const areasSelectable = Boolean(onAreaSelect);
  const [tileError, setTileError] = useState(false);
  const [moving, setMoving] = useState(false);
  const initialPoint = useRef(value);
  const restoredViewport = useRef(initialViewport);
  const keptCamera = useRef<MapViewport | null>(null);
  const viewportChangeRef = useRef(onViewportChange);
  viewportChangeRef.current = onViewportChange;
  const userMotionRef = useRef(onUserMotionChange);
  userMotionRef.current = onUserMotionChange;
  const focusRef = useRef(focus);
  const lastFocus = useRef(focus);
  focusRef.current = focus;
  const focusShowAreasRequest = useRef(showAreasRequest);
  const [markerHosts, setMarkerHosts] = useState<
    { id: string; host: HTMLElement; preview: ReactNode }[]
  >([]);
  const fittedGeometry = useRef('');
  const bounds = useRef<LngLatBounds | null>(null);
  const autoFrame = useRef(true);
  const updateFrame = useRef<(() => void) | null>(null);
  const cameraMoving = useRef(false);
  const finishCamera = useRef<(() => void) | null>(null);
  const [areaHosts, setAreaHosts] = useState<
    { id: string; host: HTMLElement; marker: ReactNode }[]
  >([]);
  const areaEntries = useRef(
    new Map<
      string,
      {
        marker: Marker;
        circle: HTMLElement;
        host: HTMLElement;
        area: MapArea;
      }
    >(),
  );
  const framePadding = useRef<number | typeof AREA_PADDING>(40);
  const areasRef = useRef(areas);
  areasRef.current = areas;
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const connectionOverlay = useRef<ConnectionOverlay | null>(null);
  const stopConnectionVisibility = useRef<(() => void) | null>(null);
  const placeConnection = useRef<(() => void) | null>(null);
  const markers = useRef(
    new Map<
      string,
      { marker: Marker; host: HTMLElement; count: HTMLElement }
    >(),
  );

  useEffect(() => {
    if (!container.current) return;
    fittedGeometry.current = '';
    // A locale change recreates the map. After the viewer moved the camera it
    // starts where they left it, not at the opening view (4.8); an automatic
    // frame is simply framed again.
    if (keptCamera.current && !autoFrame.current)
      restoredViewport.current = keptCamera.current;
    autoFrame.current = !restoredViewport.current;
    const element = container.current;
    const point =
      restoredViewport.current ?? initialPoint.current ?? focusRef.current;
    const map = new MapLibreMap({
      container: element,
      center: point ? lngLat(point) : [10.45, 51.16],
      zoom: toMapZoom(restoredViewport.current?.zoom ?? (point ? 15 : 5)),
      maxZoom: toMapZoom(MAX_ZOOM),
      // Keep more decoded zoom levels in memory so zooming in and out over the
      // same area reuses tiles instead of reloading and re-parsing them. The
      // network side is already cached by the service worker and the browser.
      maxTileCacheZoomLevels: TILE_CACHE_ZOOM_LEVELS,
      transformRequest: isCapacitorNative() ? cacheNativeTiles : undefined,
      // The page scrolls past an embedded map; zoom stays on buttons, double
      // tap and pinch. Rotation/tilt would need a compass the product lacks.
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: false },
    });
    map.touchZoomRotate.disableRotation();
    map.dragPan.enable(panInertia());
    // Complete: the opening view has drawn and the marker photos have loaded
    // and decoded (or a short wait passed); never later than the cap.
    setComplete(false);
    let revealed = false;
    let revealFrame = 0;
    let revealCap = 0;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      window.cancelAnimationFrame(revealFrame);
      window.clearTimeout(revealCap);
      setComplete(true);
    };
    revealCap = window.setTimeout(reveal, MAP_REVEAL_CAP_MS);
    map.once('idle', () => {
      const until = performance.now() + MAP_REVEAL_PHOTO_WAIT_MS;
      const bounds = () => element.getBoundingClientRect();
      // Only photos in the visible map count: a lazy photo outside it would
      // never load, and a deferred placeholder is not loading at all.
      const visiblePhotos = () => {
        const box = bounds();
        return [...element.querySelectorAll('img')].filter((image) => {
          const rect = image.getBoundingClientRect();
          return (
            rect.right > box.left &&
            rect.left < box.right &&
            rect.bottom > box.top &&
            rect.top < box.bottom
          );
        });
      };
      const photosReady = () => {
        if (revealed) return;
        const loading =
          element.querySelector(
            '.story-media-skeleton:not([data-media-deferred])',
          ) !== null || visiblePhotos().some((image) => !image.complete);
        if (loading && performance.now() < until) {
          revealFrame = window.requestAnimationFrame(photosReady);
          return;
        }
        // Decoded before they show, so no photo pops in after the fade.
        const decoded = visiblePhotos()
          .filter((image) => image.complete && image.naturalWidth > 0)
          .map((image) => image.decode().catch(() => undefined));
        const settle = new Promise((done) =>
          window.setTimeout(done, MAP_REVEAL_DECODE_WAIT_MS),
        );
        void Promise.race([Promise.all(decoded), settle]).then(reveal);
      };
      photosReady();
    });
    const dataFrom = t('m5s3.map.attributionDataFrom');
    const localizedStyle = (
      previous: StyleSpecification | undefined,
      next: StyleSpecification,
    ) => withLocalizedAttribution(googleLikeStyle(previous, next), dataFrom);
    // A style kept on the device (#2063) lets the first tiles load at once;
    // without one the map fetches style and TileJSON as before. Either way
    // the stored copy is refreshed in the background once the map has drawn.
    const storedStyle = cachedBasemapStyle(MAP_STYLE_URL);
    let usingStoredStyle = storedStyle !== null;
    if (storedStyle)
      map.setStyle(
        withLocalizedAttribution(
          googleLikeStyle(undefined, storedStyle),
          dataFrom,
        ),
      );
    else map.setStyle(MAP_STYLE_URL, { transformStyle: localizedStyle });
    map.once('idle', () => {
      void refreshBasemapStyle(MAP_STYLE_URL).catch(() => undefined);
    });
    let missingTiles = 0;
    mapRef.current = map;
    map.addControl(
      new ZoomControl({
        zoomIn: t('m5s3.map.zoomIn'),
        zoomOut: t('m5s3.map.zoomOut'),
      }),
      'bottom-right',
    );
    const sizeAreas = () => {
      for (const entry of areaEntries.current.values()) {
        const diameter = areaDiameterPx(map, entry.area);
        entry.circle.style.width = `${diameter}px`;
        entry.circle.style.height = `${diameter}px`;
      }
    };
    map.on('zoom', sizeAreas);
    const removeConnection = () => {
      stopConnectionVisibility.current?.();
      stopConnectionVisibility.current = null;
      connectionOverlay.current?.remove();
      connectionOverlay.current = null;
    };
    // The connection follows the areas on every camera change.
    const drawConnection = () => {
      const current = connectionRef.current;
      const from = current && areaEntries.current.get(current.from);
      const to = current && areaEntries.current.get(current.to);
      if (!current || !from || !to) {
        removeConnection();
        return;
      }
      if (!connectionOverlay.current) {
        const overlay = new ConnectionOverlay(
          map.getCanvasContainer(),
          map.getCanvas(),
        );
        connectionOverlay.current = overlay;
        // Decorative motion holds while the page, the kept view or the map
        // is out of sight, and continues where it paused (M4, M8).
        stopConnectionVisibility.current = observeVisibility(
          overlay.element,
          ({ visible }) => (visible ? overlay.resume() : overlay.pause()),
        );
        // Start once the basemap is drawn; a slow or failing basemap must
        // not hold the connection back for long.
        const start = () => {
          window.clearTimeout(fallback);
          if (connectionOverlay.current === overlay) overlay.start();
        };
        const fallback = window.setTimeout(start, MAP_READY_FALLBACK_MS);
        if (map.loaded()) start();
        else map.once('idle', start);
      }
      connectionOverlay.current.update(
        current,
        map.project(lngLat(from.area)),
        map.project(lngLat(to.area)),
        { width: element.clientWidth, height: element.clientHeight },
      );
    };
    placeConnection.current = drawConnection;
    map.on('move', drawConnection);
    map.on('resize', drawConnection);
    // A missing tile (HTTP 404) is an empty area; aborted requests are
    // ordinary pan/zoom cancellation. Everything else is a real outage.
    map.on('error', (event: ErrorEvent) => {
      const error = event.error as (Error & { status?: number }) | undefined;
      if (error?.name === 'AbortError') return;
      if (error?.status === 404) {
        // Several missing tiles from a stored style mean its tile set has
        // gone: forget it and load the current style.
        if (usingStoredStyle && ++missingTiles >= STORED_STYLE_MISSING_TILES) {
          usingStoredStyle = false;
          forgetBasemapStyle();
          map.setStyle(MAP_STYLE_URL, { transformStyle: localizedStyle });
        }
        return;
      }
      setTileError(true);
      // An outage shows its notice at once instead of a waiting surface.
      reveal();
    });
    map.on('click', (event: MapMouseEvent) =>
      selectRef.current?.({
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      }),
    );
    let framing = false;
    let restorePending = Boolean(restoredViewport.current);
    const frame = () => {
      // Dialog children can mount before showModal/layout. Fit only after a
      // real size exists, and refit layout changes until the user moves the map.
      if (!container.current?.clientWidth || !container.current.clientHeight)
        return;
      framing = true;
      try {
        map.resize();
        if (restorePending && restoredViewport.current) {
          const restored = restoredViewport.current;
          restorePending = false;
          map.jumpTo({
            center: lngLat(restored),
            zoom: toMapZoom(restored.zoom),
          });
          return;
        }
        // A selection owns its one camera transition. Presentation/resize work
        // must not snap to the target before that transition can start or finish.
        if (
          cameraMoving.current ||
          !sameFocus(lastFocus.current, focusRef.current)
        )
          return;
        if (focusRef.current && autoFrame.current)
          map.jumpTo(focusCamera(map, focusRef.current));
        else if (bounds.current && autoFrame.current)
          map.fitBounds(bounds.current, {
            padding: framePadding.current,
            maxZoom: toMapZoom(OVERVIEW_MAX_ZOOM),
            animate: false,
          });
      } finally {
        framing = false;
      }
    };
    updateFrame.current = frame;
    let userMoving = false;
    let restTimer: number | undefined;
    const settleUserMotion = () => {
      window.clearTimeout(restTimer);
      restTimer = window.setTimeout(() => {
        if (!userMoving) return;
        userMoving = false;
        userMotionRef.current?.(false);
      }, USER_MOTION_REST_MS);
    };
    map.on('movestart', (event) => {
      if (!framing) autoFrame.current = false;
      // Only the viewer's own gestures count, not framing or place flights.
      if (!event?.originalEvent) return;
      window.clearTimeout(restTimer);
      if (!userMoving) {
        userMoving = true;
        userMotionRef.current?.(true);
      }
    });
    map.on('moveend', () => {
      if (userMoving) settleUserMotion();
      cameraMoving.current = false;
      finishCamera.current = null;
      setMoving(false);
      const center = map.getCenter();
      const viewport = {
        latitude: center.lat,
        longitude: center.lng,
        zoom: fromMapZoom(map.getZoom()),
      };
      keptCamera.current = viewport;
      viewportChangeRef.current?.(viewport);
    });
    const interrupt = () => {
      if (!cameraMoving.current) return;
      finishCamera.current = null;
      map.stop();
      cameraMoving.current = false;
      autoFrame.current = false;
      setMoving(false);
    };
    // MapLibre owns pan/pinch; direct input stops a running camera journey
    // at once: the finger always wins (4.8).
    for (const event of ['pointerdown', 'wheel', 'keydown'])
      element.addEventListener(event, interrupt, { passive: true });
    // A change of the preference applies at once: the pan inertia follows
    // it, and a running journey finishes where it was going.
    const stopMotionPreference = subscribeReducedMotion(() => {
      map.dragPan.enable(panInertia());
      if (prefersReducedMotion()) finishCamera.current?.();
    });
    const resize = new ResizeObserver(frame);
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      window.clearTimeout(restTimer);
      if (userMoving) userMotionRef.current?.(false);
      for (const event of ['pointerdown', 'wheel', 'keydown'])
        element.removeEventListener(event, interrupt);
      stopMotionPreference();
      revealed = true;
      window.cancelAnimationFrame(revealFrame);
      window.clearTimeout(revealCap);
      removeConnection();
      placeConnection.current = null;
      map.remove();
      markers.current.clear();
      areaEntries.current.clear();
      cameraMoving.current = false;
      finishCamera.current = null;
      mapRef.current = null;
      markerRef.current = null;
      updateFrame.current = null;
      bounds.current = null;
    };
  }, [t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Locale changes recreate the map and must restore its selected point.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    const position = lngLat(value);
    map.jumpTo({
      center: position,
      zoom: Math.max(map.getZoom(), toMapZoom(PLACE_ZOOM)),
    });
    if (markerRef.current) markerRef.current.setLngLat(position);
    else {
      const pin = document.createElement('span');
      pin.className = 'place-map-selected-marker';
      markerRef.current = new Marker({ element: pin })
        .setLngLat(position)
        .addTo(map);
    }
  }, [value, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Locale changes recreate the map and must restore its location layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const liveIds = new Set(locations?.map(({ id }) => id));
    for (const [id, entry] of markers.current) {
      if (liveIds.has(id)) continue;
      entry.marker.remove();
      markers.current.delete(id);
    }
    const hosts = [];
    for (const location of locations ?? []) {
      let entry = markers.current.get(location.id);
      if (!entry) {
        const content = document.createElement('span');
        content.className = 'memory-map-marker-content';
        const host = document.createElement('span');
        host.className = 'memory-map-marker-photo';
        content.append(host);
        const count = document.createElement('span');
        count.className = 'memory-map-marker-count';
        content.append(count);
        const pin = document.createElement('div');
        pin.className = 'memory-map-marker';
        pin.tabIndex = 0;
        pin.setAttribute('role', 'button');
        pin.append(content);
        const select = (event: Event) => {
          // The map's own click is a Place pick; a marker is not one.
          event.stopPropagation();
          locationSelectRef.current?.(location.id);
        };
        pin.addEventListener('click', select);
        pin.addEventListener('keydown', (event) => {
          if (!MARKER_KEYS.includes(event.key)) return;
          event.preventDefault();
          select(event);
        });
        const marker = new Marker({ element: pin })
          .setLngLat(lngLat(location))
          .addTo(map);
        entry = { marker, host, count };
        markers.current.set(location.id, entry);
      }
      entry.count.textContent = String(location.count);
      const element = entry.marker.getElement();
      element.setAttribute('aria-label', location.label);
      element.setAttribute('title', location.label);
      hosts.push({
        id: location.id,
        host: entry.host,
        preview: location.preview,
      });
    }
    setMarkerHosts(hosts);
    const geometry = JSON.stringify(
      locations?.map(({ id, latitude, longitude }) => [
        id,
        latitude,
        longitude,
      ]),
    );
    if (fittedGeometry.current !== geometry) {
      if (locations?.length) {
        // The overview frames the densest region; one distant trip no longer
        // zooms the map out to the whole world (#2063).
        const fitted = new LngLatBounds();
        for (const point of framingPoints(locations))
          fitted.extend(lngLat(point));
        bounds.current = fitted;
      } else bounds.current = null;
      if (
        !focusRef.current &&
        !lastFocus.current &&
        !restoredViewport.current
      ) {
        autoFrame.current = true;
        updateFrame.current?.();
      }
    }
    fittedGeometry.current = geometry;
  }, [locations, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Locale changes recreate the map and must restore its areas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const liveIds = new Set(areas?.map(({ id }) => id));
    const membershipChanged =
      liveIds.size !== areaEntries.current.size ||
      [...liveIds].some((id) => !areaEntries.current.has(id));
    for (const [id, entry] of areaEntries.current) {
      if (liveIds.has(id)) continue;
      entry.marker.remove();
      areaEntries.current.delete(id);
    }
    const hosts = [];
    for (const area of areas ?? []) {
      const selectable = areasSelectable && Boolean(area.selectLabel);
      let entry = areaEntries.current.get(area.id);
      if (entry && (entry.host.tagName === 'BUTTON') !== selectable) {
        entry.marker.remove();
        areaEntries.current.delete(area.id);
        entry = undefined;
      }
      if (!entry) {
        const element = document.createElement('div');
        element.className = `place-map-area is-${area.tone}`;
        // The page carries the text alternative; the drawing is decorative.
        const circle = document.createElement('span');
        circle.className = 'place-map-area-circle';
        circle.setAttribute('aria-hidden', 'true');
        let host: HTMLElement;
        if (selectable) {
          // Only the avatar takes the tap (#2158); the area stays see-through
          // for the map's own gestures, as before.
          const button = document.createElement('button');
          button.type = 'button';
          button.addEventListener('click', (event) => {
            // The map's own click is a Place pick; a person is not one.
            event.stopPropagation();
            areaSelectRef.current?.(area.id);
          });
          host = button;
        } else {
          host = document.createElement('span');
          host.setAttribute('aria-hidden', 'true');
        }
        host.className = 'place-map-area-marker';
        element.append(circle, host);
        const marker = new Marker({ element })
          .setLngLat(lngLat(area))
          .addTo(map);
        entry = { marker, circle, host, area };
        areaEntries.current.set(area.id, entry);
      }
      entry.area = area;
      entry.marker.setLngLat(lngLat(area));
      if (selectable && area.selectLabel) {
        entry.host.setAttribute('aria-label', area.selectLabel);
        entry.host.title = area.selectLabel;
      }
      const diameter = areaDiameterPx(map, area);
      entry.circle.style.width = `${diameter}px`;
      entry.circle.style.height = `${diameter}px`;
      hosts.push({ id: area.id, host: entry.host, marker: area.marker });
    }
    setAreaHosts(hosts);
    // Own and partner areas may arrive independently. Include new areas
    // while the camera is automatic, and discard bounds of removed areas.
    // A person in focus keeps the camera, but "show us" and clearing the
    // focus return to everyone who is there now.
    if (membershipChanged && !locations?.length) {
      framePadding.current = AREA_PADDING;
      bounds.current = areas?.length ? areaBounds(areas) : null;
      if (autoFrame.current && !focusRef.current) updateFrame.current?.();
    }
  }, [areas, areasSelectable, locations?.length, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Area and locale changes move or recreate the connection's ends.
  useEffect(() => {
    placeConnection.current?.();
  }, [connection, areas, t]);

  useEffect(() => {
    if (connection?.playRequest) connectionOverlay.current?.play();
  }, [connection?.playRequest]);

  // An explicit "show us" frames the areas again, with reduced-motion snap.
  useEffect(() => {
    const map = mapRef.current;
    const current = areasRef.current;
    if (!map || !showAreasRequest || !current?.length) return;
    const target = areaBounds(current);
    if (!target) return;
    map.stop();
    const options = {
      padding: AREA_PADDING,
      maxZoom: toMapZoom(OVERVIEW_MAX_ZOOM),
    };
    const snap = () => {
      finishCamera.current = null;
      map.stop();
      cameraMoving.current = false;
      map.fitBounds(target, { ...options, animate: false });
    };
    const duration = cameraJourneyMs();
    if (!duration) {
      snap();
      return;
    }
    // One camera transition at a time: the finger, a later request or a
    // change to reduced motion ends it like a Place journey.
    finishCamera.current = snap;
    cameraMoving.current = true;
    map.fitBounds(target, { ...options, duration, essential: true });
  }, [showAreasRequest]);

  // An explicit Place selection owns the frame. User panning and later layout
  // changes do not repeatedly steal it; clearing the filter restores bounds.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Locale changes recreate the map instance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const wasFocused = lastFocus.current;
    lastFocus.current = focus;
    // A "show us" that clears the focus in the same step owns the journey
    // back to everyone; a second flight would only interrupt it.
    const showAreasRequested =
      focusShowAreasRequest.current !== showAreasRequest;
    focusShowAreasRequest.current = showAreasRequest;
    if (sameFocus(wasFocused, focus)) return;
    if (!focus && showAreasRequested) return;
    if (!focus && (!wasFocused || value || !bounds.current)) return;
    map.stop();
    autoFrame.current = !focus;
    const overview = bounds.current;
    const options = { padding: 64, maxZoom: toMapZoom(OVERVIEW_MAX_ZOOM) };
    const target = focus ? focusCamera(map, focus) : null;
    const snap = () => {
      finishCamera.current = null;
      map.stop();
      cameraMoving.current = false;
      setMoving(false);
      if (target) map.jumpTo(target);
      else if (overview)
        map.fitBounds(overview, { ...options, animate: false });
    };
    const duration = cameraJourneyMs();
    if (!duration || !container.current?.clientWidth) {
      snap();
      return;
    }
    finishCamera.current = snap;
    cameraMoving.current = true;
    setMoving(true);
    if (target) map.flyTo({ ...target, duration, essential: true });
    else if (overview) {
      const camera = map.cameraForBounds(overview, options);
      if (camera) map.flyTo({ ...camera, duration, essential: true });
      else snap();
    }
  }, [focus, value, t]);

  return (
    <div
      className="place-map-canvas"
      data-map-moving={moving}
      data-reveal={
        revealWhenComplete ? (complete ? 'complete' : 'waiting') : undefined
      }
    >
      {revealWhenComplete && !complete ? (
        <p className="place-map-waiting" role="status">
          {t('states.loading.title')}
        </p>
      ) : null}
      {markerHosts.map(({ id, host, preview }) =>
        createPortal(preview, host, id),
      )}
      {areaHosts.map(({ id, host, marker }) =>
        createPortal(marker, host, `area:${id}`),
      )}
      <div
        ref={container}
        className="place-map-viewport"
        role="application"
        aria-label={
          ariaLabel ??
          t(onSelect ? 'm5s3.map.keyboardHelp' : 'memoryMap.keyboardHelp')
        }
      />
      {onSelect ? (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const center = mapRef.current?.getCenter();
            if (center)
              onSelect({ latitude: center.lat, longitude: center.lng });
          }}
        >
          {t('m5s3.map.useCenter')}
        </button>
      ) : null}
      {tileError ? (
        <p role="status">
          {t('m5s3.map.tileError')}{' '}
          <button
            type="button"
            className="tertiary"
            onClick={() => {
              setTileError(false);
              mapRef.current?.setStyle(MAP_STYLE_URL, {
                transformStyle: (previous, next) =>
                  withLocalizedAttribution(
                    googleLikeStyle(previous, next),
                    t('m5s3.map.attributionDataFrom'),
                  ),
              });
            }}
          >
            {t('common.retry')}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function samePoint(left?: MapPoint, right?: MapPoint) {
  return (
    left?.latitude === right?.latitude && left?.longitude === right?.longitude
  );
}

function sameFocus(left?: MapFocus, right?: MapFocus) {
  return (
    samePoint(left, right) &&
    left?.radiusMeters === right?.radiusMeters &&
    left?.request === right?.request
  );
}
