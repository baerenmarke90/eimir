import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from '../i18n';
import './PlaceMapPicker.css';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export default function PlaceMapCanvas({
  value,
  onSelect,
}: {
  value?: MapPoint;
  onSelect: (point: MapPoint) => void;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [tileError, setTileError] = useState(false);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const initialPoint = useRef(value);

  useEffect(() => {
    if (!container.current) return;
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
      selectRef.current({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      }),
    );
    const resize = new ResizeObserver(() =>
      map.invalidateSize({ animate: false }),
    );
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [t]);

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
  }, [value]);

  return (
    <div className="place-map-canvas">
      <div
        ref={container}
        className="place-map-viewport"
        role="application"
        aria-label={t('m5s3.map.keyboardHelp')}
      />
      <button
        type="button"
        className="secondary"
        onClick={() => {
          const center = mapRef.current?.getCenter();
          if (center) onSelect({ latitude: center.lat, longitude: center.lng });
        }}
      >
        {t('m5s3.map.useCenter')}
      </button>
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
