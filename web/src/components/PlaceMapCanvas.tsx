import * as L from 'leaflet';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cssDurationMilliseconds } from '../client/cssDuration';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from '../i18n';
import './PlaceMapPicker.css';

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

export default function PlaceMapCanvas({
  value,
  focus,
  onSelect,
  locations,
  onLocationSelect,
  initialViewport,
  onViewportChange,
}: {
  value?: MapPoint;
  focus?: MapPoint;
  onSelect?: (point: MapPoint) => void;
  locations?: readonly MapLocation[];
  onLocationSelect?: (id: string) => void;
  initialViewport?: MapViewport;
  onViewportChange?: (viewport: MapViewport) => void;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const locationSelectRef = useRef(onLocationSelect);
  locationSelectRef.current = onLocationSelect;
  const [tileError, setTileError] = useState(false);
  const [moving, setMoving] = useState(false);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const initialPoint = useRef(value);
  const restoredViewport = useRef(initialViewport);
  const viewportChangeRef = useRef(onViewportChange);
  viewportChangeRef.current = onViewportChange;
  const focusRef = useRef(focus);
  const lastFocus = useRef(focus);
  focusRef.current = focus;
  const [markerHosts, setMarkerHosts] = useState<
    { id: string; host: HTMLElement; preview: ReactNode }[]
  >([]);
  const fittedGeometry = useRef('');
  const bounds = useRef<L.LatLngBounds | null>(null);
  const autoFrame = useRef(true);
  const updateFrame = useRef<(() => void) | null>(null);
  const cameraMoving = useRef(false);
  const finishCamera = useRef<(() => void) | null>(null);
  const markers = useRef(
    new Map<
      string,
      { marker: L.Marker; host: HTMLElement; count: HTMLElement }
    >(),
  );

  useEffect(() => {
    if (!container.current) return;
    fittedGeometry.current = '';
    autoFrame.current = !restoredViewport.current;
    const element = container.current;
    const point =
      restoredViewport.current ?? initialPoint.current ?? focusRef.current;
    const map = L.map(element, {
      zoomControl: false,
      scrollWheelZoom: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView(
      point ? [point.latitude, point.longitude] : [51.16, 10.45],
      restoredViewport.current?.zoom ?? (point ? 15 : 5),
    );
    mapRef.current = map;
    L.control
      .zoom({
        zoomInTitle: t('m5s3.map.zoomIn'),
        zoomOutTitle: t('m5s3.map.zoomOut'),
      })
      .addTo(map);
    tileLayer.current = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        referrerPolicy: 'origin',
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      },
    )
      .on('tileerror', () => setTileError(true))
      .addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) =>
      selectRef.current?.({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
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
        map.invalidateSize({ animate: false, pan: false });
        if (restorePending && restoredViewport.current) {
          const restored = restoredViewport.current;
          restorePending = false;
          map.setView([restored.latitude, restored.longitude], restored.zoom, {
            animate: false,
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
          map.setView(
            [focusRef.current.latitude, focusRef.current.longitude],
            15,
            { animate: false },
          );
        else if (bounds.current && autoFrame.current)
          map.fitBounds(bounds.current, {
            padding: [40, 40],
            maxZoom: 12,
            animate: false,
          });
      } finally {
        framing = false;
      }
    };
    updateFrame.current = frame;
    map.on('movestart zoomstart', () => {
      if (!framing) autoFrame.current = false;
    });
    map.on('moveend', () => {
      cameraMoving.current = false;
      finishCamera.current = null;
      setMoving(false);
      const center = map.getCenter();
      viewportChangeRef.current?.({
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
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
    // Leaflet owns pan/pinch; direct input supersedes a pending place flight.
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
      for (const event of ['pointerdown', 'wheel', 'keydown'])
        element.removeEventListener(event, interrupt);
      motion?.removeEventListener('change', motionChanged);
      map.remove();
      markers.current.clear();
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
    const position: L.LatLngExpression = [value.latitude, value.longitude];
    map.setView(position, Math.max(map.getZoom(), 15), { animate: false });
    if (markerRef.current) markerRef.current.setLatLng(position);
    else
      markerRef.current = L.circleMarker(position, {
        radius: 10,
        weight: 3,
        className: 'place-map-selected-marker',
      }).addTo(map);
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
        const marker = L.marker([location.latitude, location.longitude], {
          title: location.label,
          alt: location.label,
          icon: L.divIcon({
            html: content,
            className: 'memory-map-marker',
            iconSize: [56, 56],
            iconAnchor: [28, 28],
          }),
        })
          .on('click', () => locationSelectRef.current?.(location.id))
          .addTo(map);
        entry = { marker, host, count };
        markers.current.set(location.id, entry);
      }
      entry.count.textContent = String(location.count);
      const element = entry.marker.getElement();
      element?.setAttribute('aria-label', location.label);
      element?.setAttribute('title', location.label);
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
      bounds.current = locations?.length
        ? L.latLngBounds(
            locations.map((point) => [point.latitude, point.longitude]),
          )
        : null;
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
    const options = { padding: [64, 64] as L.PointTuple, maxZoom: 12 };
    const snap = () => {
      finishCamera.current = null;
      map.stop();
      cameraMoving.current = false;
      setMoving(false);
      if (focus)
        map.setView([focus.latitude, focus.longitude], 15, { animate: false });
      else if (overview)
        map.fitBounds(overview, { ...options, animate: false });
    };
    const duration = container.current
      ? cssDurationMilliseconds(
          getComputedStyle(container.current).getPropertyValue(
            '--duration-map-camera',
          ),
        ) / 1000
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
    if (focus) map.flyTo([focus.latitude, focus.longitude], 15, { duration });
    else if (overview) map.flyToBounds(overview, { ...options, duration });
  }, [focus, value, t]);

  return (
    <div className="place-map-canvas" data-map-moving={moving}>
      {markerHosts.map(({ id, host, preview }) =>
        createPortal(preview, host, id),
      )}
      <div
        ref={container}
        className="place-map-viewport"
        role="application"
        aria-label={t(
          onSelect ? 'm5s3.map.keyboardHelp' : 'memoryMap.keyboardHelp',
        )}
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
              tileLayer.current?.redraw();
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
