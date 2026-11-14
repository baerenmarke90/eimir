import {
  type ErrorEvent,
  type IControl,
  LngLatBounds,
  MapLibreMap,
  type MapMouseEvent,
  Marker,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cssDurationMilliseconds } from '../client/cssDuration';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from '../i18n';
import './PlaceMapPicker.css';
import { googleLikeStyle } from './placeMapStyle';

// The CSP forbids blob workers, so MapLibre runs its first-party worker file.
setWorkerUrl(workerUrl);

/** Keyless vector style built from OpenStreetMap data; see docs/DEPENDENCIES.md. */
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
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
 * map once; later updates never move the camera.
 */
export interface MapArea extends MapPoint {
  id: string;
  radiusMeters: number;
  marker?: ReactNode;
  tone: 'partner' | 'own';
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

function areaBounds(areas: readonly MapArea[]): LngLatBounds | null {
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
      button.addEventListener('click', () =>
        kind === 'in' ? map.zoomIn() : map.zoomOut(),
      );
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
  areas,
  showAreasRequest = 0,
  ariaLabel,
}: {
  value?: MapPoint;
  focus?: MapPoint;
  onSelect?: (point: MapPoint) => void;
  locations?: readonly MapLocation[];
  onLocationSelect?: (id: string) => void;
  initialViewport?: MapViewport;
  onViewportChange?: (viewport: MapViewport) => void;
  /** True while the viewer pans or zooms, and for a moment after they stop. */
  onUserMotionChange?: (moving: boolean) => void;
  areas?: readonly MapArea[];
  /** Increment to frame all areas again (an explicit "show us"). */
  showAreasRequest?: number;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const locationSelectRef = useRef(onLocationSelect);
  locationSelectRef.current = onLocationSelect;
  const [tileError, setTileError] = useState(false);
  const [moving, setMoving] = useState(false);
  const initialPoint = useRef(value);
  const restoredViewport = useRef(initialViewport);
  const viewportChangeRef = useRef(onViewportChange);
  viewportChangeRef.current = onViewportChange;
  const userMotionRef = useRef(onUserMotionChange);
  userMotionRef.current = onUserMotionChange;
  const focusRef = useRef(focus);
  const lastFocus = useRef(focus);
  focusRef.current = focus;
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
    new Map<string, { marker: Marker; circle: HTMLElement; area: MapArea }>(),
  );
  const areasFramed = useRef(false);
  const framePadding = useRef<number | typeof AREA_PADDING>(40);
  const areasRef = useRef(areas);
  areasRef.current = areas;
  const markers = useRef(
    new Map<
      string,
      { marker: Marker; host: HTMLElement; count: HTMLElement }
    >(),
  );

  useEffect(() => {
    if (!container.current) return;
    fittedGeometry.current = '';
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
      // The page scrolls past an embedded map; zoom stays on buttons, double
      // tap and pinch. Rotation/tilt would need a compass the product lacks.
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: false },
    });
    map.touchZoomRotate.disableRotation();
    map.setStyle(MAP_STYLE_URL, { transformStyle: googleLikeStyle });
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
    // A missing tile (HTTP 404) is an empty area; aborted requests are
    // ordinary pan/zoom cancellation. Everything else is a real outage.
    map.on('error', (event: ErrorEvent) => {
      const error = event.error as (Error & { status?: number }) | undefined;
      if (error?.name === 'AbortError' || error?.status === 404) return;
      setTileError(true);
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
          !samePoint(lastFocus.current, focusRef.current)
        )
          return;
        if (focusRef.current && autoFrame.current)
          map.jumpTo({
            center: lngLat(focusRef.current),
            zoom: toMapZoom(PLACE_ZOOM),
          });
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
      viewportChangeRef.current?.({
        latitude: center.lat,
        longitude: center.lng,
        zoom: fromMapZoom(map.getZoom()),
      });
    });
    const interrupt = () => {
      if (!cameraMoving.current) return;
      finishCamera.current = null;
      map.stop();
      cameraMoving.current = false;
      autoFrame.current = false;
      setMoving(false);
    };
    // MapLibre owns pan/pinch; direct input supersedes a pending place flight.
    for (const event of ['pointerdown', 'wheel', 'keydown'])
      element.addEventListener(event, interrupt, { passive: true });
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const motionChanged = () => {
      if (motion?.matches) finishCamera.current?.();
    };
    motion?.addEventListener('change', motionChanged);
    const resize = new ResizeObserver(frame);
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      window.clearTimeout(restTimer);
      if (userMoving) userMotionRef.current?.(false);
      for (const event of ['pointerdown', 'wheel', 'keydown'])
        element.removeEventListener(event, interrupt);
      motion?.removeEventListener('change', motionChanged);
      map.remove();
      markers.current.clear();
      areaEntries.current.clear();
      areasFramed.current = false;
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
        const fitted = new LngLatBounds();
        for (const point of locations) fitted.extend(lngLat(point));
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
    for (const [id, entry] of areaEntries.current) {
      if (liveIds.has(id)) continue;
      entry.marker.remove();
      areaEntries.current.delete(id);
    }
    const hosts = [];
    for (const area of areas ?? []) {
      let entry = areaEntries.current.get(area.id);
      if (!entry) {
        const element = document.createElement('div');
        element.className = `place-map-area is-${area.tone}`;
        // The page carries the text alternative; the drawing is decorative.
        element.setAttribute('aria-hidden', 'true');
        const circle = document.createElement('span');
        circle.className = 'place-map-area-circle';
        const host = document.createElement('span');
        host.className = 'place-map-area-marker';
        element.append(circle, host);
        const marker = new Marker({ element })
          .setLngLat(lngLat(area))
          .addTo(map);
        entry = { marker, circle, area };
        areaEntries.current.set(area.id, entry);
      }
      entry.area = area;
      entry.marker.setLngLat(lngLat(area));
      const diameter = areaDiameterPx(map, area);
      entry.circle.style.width = `${diameter}px`;
      entry.circle.style.height = `${diameter}px`;
      const host = entry.marker
        .getElement()
        .querySelector<HTMLElement>('.place-map-area-marker');
      if (host) hosts.push({ id: area.id, host, marker: area.marker });
    }
    setAreaHosts(hosts);
    // Frame the first areas once; data refreshes never re-centre the map.
    if (
      !areasFramed.current &&
      areas?.length &&
      !locations?.length &&
      !focusRef.current &&
      !restoredViewport.current
    ) {
      areasFramed.current = true;
      framePadding.current = AREA_PADDING;
      bounds.current = areaBounds(areas);
      autoFrame.current = true;
      updateFrame.current?.();
    }
  }, [areas, t]);

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
    const duration = container.current
      ? cssDurationMilliseconds(
          getComputedStyle(container.current).getPropertyValue(
            '--duration-map-camera',
          ),
        )
      : 0;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reduced || !duration)
      map.fitBounds(target, { ...options, animate: false });
    else map.fitBounds(target, { ...options, duration, essential: true });
  }, [showAreasRequest]);

  // An explicit Place selection owns the frame. User panning and later layout
  // changes do not repeatedly steal it; clearing the filter restores bounds.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Locale changes recreate the map instance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const wasFocused = lastFocus.current;
    lastFocus.current = focus;
    if (samePoint(wasFocused, focus)) return;
    if (!focus && (!wasFocused || value || !bounds.current)) return;
    map.stop();
    autoFrame.current = !focus;
    const overview = bounds.current;
    const options = { padding: 64, maxZoom: toMapZoom(OVERVIEW_MAX_ZOOM) };
    const snap = () => {
      finishCamera.current = null;
      map.stop();
      cameraMoving.current = false;
      setMoving(false);
      if (focus)
        map.jumpTo({ center: lngLat(focus), zoom: toMapZoom(PLACE_ZOOM) });
      else if (overview)
        map.fitBounds(overview, { ...options, animate: false });
    };
    const duration = container.current
      ? cssDurationMilliseconds(
          getComputedStyle(container.current).getPropertyValue(
            '--duration-map-camera',
          ),
        )
      : 0;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reduced || !duration || !container.current?.clientWidth) {
      snap();
      return;
    }
    finishCamera.current = snap;
    cameraMoving.current = true;
    setMoving(true);
    if (focus)
      map.flyTo({
        center: lngLat(focus),
        zoom: toMapZoom(PLACE_ZOOM),
        duration,
        essential: true,
      });
    else if (overview) {
      const camera = map.cameraForBounds(overview, options);
      if (camera) map.flyTo({ ...camera, duration, essential: true });
      else snap();
    }
  }, [focus, value, t]);

  return (
    <div className="place-map-canvas" data-map-moving={moving}>
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
                transformStyle: googleLikeStyle,
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
