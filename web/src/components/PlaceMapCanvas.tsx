import * as L from 'leaflet';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from '../i18n';
import './PlaceMapPicker.css';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapLocation extends MapPoint {
  id: string;
  label: string;
  count: number;
  preview?: ReactNode;
}

export default function PlaceMapCanvas({
  value,
  onSelect,
  locations,
  onLocationSelect,
}: {
  value?: MapPoint;
  onSelect?: (point: MapPoint) => void;
  locations?: readonly MapLocation[];
  onLocationSelect?: (id: string) => void;
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
  const tileLayer = useRef<L.TileLayer | null>(null);
  const initialPoint = useRef(value);
  const [markerHosts, setMarkerHosts] = useState<
    { id: string; host: HTMLElement; preview: ReactNode }[]
  >([]);
  const fittedGeometry = useRef('');
  const bounds = useRef<L.LatLngBounds | null>(null);
  const autoFrame = useRef(true);
  const updateFrame = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!container.current) return;
    fittedGeometry.current = '';
    autoFrame.current = true;
    const point = initialPoint.current;
    const map = L.map(container.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView(
      point ? [point.latitude, point.longitude] : [51.16, 10.45],
      point ? 15 : 5,
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
    const frame = () => {
      // Dialog children can mount before showModal/layout. Fit only after a
      // real size exists, and refit layout changes until the user moves the map.
      if (!container.current?.clientWidth || !container.current.clientHeight)
        return;
      framing = true;
      try {
        map.invalidateSize({ animate: false, pan: false });
        if (bounds.current && autoFrame.current)
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
    const resize = new ResizeObserver(frame);
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      map.remove();
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
    if (!map || !locations?.length) return;
    const layer = L.layerGroup().addTo(map);
    const hosts = [];
    for (const location of locations) {
      const content = document.createElement('span');
      content.className = 'memory-map-marker-content';
      const host = document.createElement('span');
      host.className = 'memory-map-marker-photo';
      content.append(host);
      hosts.push({ id: location.id, host, preview: location.preview });
      const label = document.createElement('span');
      label.className = 'memory-map-marker-count';
      label.textContent = String(location.count);
      content.append(label);
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
        .addTo(layer);
      marker.getElement()?.setAttribute('aria-label', location.label);
    }
    setMarkerHosts(hosts);
    const geometry = JSON.stringify(
      locations.map(({ id, latitude, longitude }) => [id, latitude, longitude]),
    );
    if (fittedGeometry.current !== geometry) {
      bounds.current = L.latLngBounds(
        locations.map((point) => [point.latitude, point.longitude]),
      );
      autoFrame.current = true;
      updateFrame.current?.();
    }
    fittedGeometry.current = geometry;
    return () => {
      layer.remove();
    };
  }, [locations, t]);

  return (
    <div className="place-map-canvas">
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
