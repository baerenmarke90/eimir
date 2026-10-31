import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceLookupCandidate } from '../api/generated/models/PlaceLookupCandidate';
import { normalizeClientError } from '../client/problemDetails';
import { resolvedLocale, useTranslation } from '../i18n';
import { AppErrorBoundary } from './AppErrorBoundary';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './PlaceMapPicker.css';

const createMapCanvas = () => lazy(() => import('./PlaceMapCanvas'));
export type PlaceMapSelection = PlaceLookupCandidate;

export function PlaceMapPicker({
  api,
  spaceId,
  value,
  onSelect,
  disabled = false,
}: {
  api: PlacesApi;
  spaceId: string;
  value?: PlaceMapSelection;
  onSelect: (selection: PlaceMapSelection) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="secondary place-map-open"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {t('m5s3.map.open')}
      </button>
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={t('m5s3.map.title')}
        onClose={() => setOpen(false)}
        restoreFocusRef={trigger}
        className="place-map-sheet"
      >
        {open ? (
          <PlaceMapTask
            api={api}
            spaceId={spaceId}
            value={value}
            onSelect={(selection) => {
              sheet.current?.closeForNavigation(() => {
                setOpen(false);
                onSelect(selection);
              });
            }}
          />
        ) : null}
      </ShortTaskSheet>
    </>
  );
}

function PlaceMapTask({
  api,
  spaceId,
  value,
  onSelect,
}: {
  api: PlacesApi;
  spaceId: string;
  value?: PlaceMapSelection;
  onSelect: (selection: PlaceMapSelection) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceLookupCandidate[] | null>(null);
  const [selection, setSelection] = useState(value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [MapCanvas, setMapCanvas] = useState(createMapCanvas);
  const [mapAttempt, setMapAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    if (query.trim().length < 2 || loading) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const result = await api.lookupPlaces(
        {
          spaceId,
          placeLookupRequest: { query: query.trim(), locale: resolvedLocale() },
        },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setResults(result.items);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(await normalizeClientError(failure));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <div className="place-map-task">
      <p className="field-help">{t('m5s3.map.privacy')}</p>
      <div className="place-map-search">
        <label htmlFor="place-map-query">{t('m5s3.map.searchLabel')}</label>
        <input
          id="place-map-query"
          type="search"
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
        />
        <button
          type="button"
          disabled={loading || query.trim().length < 2}
          onClick={() => void search()}
        >
          {t(loading ? 'm5s3.map.searching' : 'm5s3.map.search')}
        </button>
      </div>
      {error ? (
        <ProblemState error={error} onRetry={() => void search()} />
      ) : null}
      {results?.length === 0 ? (
        <p role="status">{t('m5s3.map.noResults')}</p>
      ) : null}
      {results?.length ? (
        <ul className="place-map-results" aria-label={t('m5s3.map.results')}>
          {results.map((item) => (
            <li key={`${item.latitude}:${item.longitude}:${item.name}`}>
              <button
                type="button"
                className="tertiary"
                aria-label={`${item.name}${item.address ? `, ${item.address}` : ''}`}
                aria-pressed={selection === item}
                onClick={() => {
                  setSelection(item);
                  setMapLoaded(true);
                }}
              >
                <strong>{item.name}</strong>
                {item.address ? <span>{item.address}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!mapLoaded ? (
        <button
          type="button"
          className="secondary"
          onClick={() => setMapLoaded(true)}
        >
          {t('m5s3.map.loadMap')}
        </button>
      ) : (
        <AppErrorBoundary
          resetKey={String(mapAttempt)}
          fallback={
            <div role="alert">
              <p>{t('m5s3.map.tileError')}</p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setMapCanvas(createMapCanvas);
                  setMapAttempt((attempt) => attempt + 1);
                }}
              >
                {t('common.retry')}
              </button>
            </div>
          }
        >
          <Suspense fallback={<p role="status">{t('states.loading.title')}</p>}>
            <MapCanvas
              value={selection}
              onSelect={(point) =>
                setSelection({ ...point, name: '', address: null })
              }
            />
          </Suspense>
        </AppErrorBoundary>
      )}
      {selection ? (
        <div className="place-map-choice">
          <label htmlFor="place-map-name">{t('m5s3.place.name')}</label>
          <input
            id="place-map-name"
            value={selection.name}
            onChange={(event) =>
              setSelection({ ...selection, name: event.target.value })
            }
            placeholder={t('m5s3.map.selectedLocation')}
          />
          <label htmlFor="place-map-address">{t('m5s3.place.address')}</label>
          <input
            id="place-map-address"
            value={selection.address ?? ''}
            onChange={(event) =>
              setSelection({
                ...selection,
                address: event.target.value || null,
              })
            }
          />
          <button
            type="button"
            onClick={() =>
              onSelect({
                ...selection,
                latitude: Number(selection.latitude.toFixed(6)),
                longitude: Number(selection.longitude.toFixed(6)),
                name: selection.name.trim() || t('m5s3.map.selectedLocation'),
              })
            }
          >
            {t('m5s3.map.confirm')}
          </button>
        </div>
      ) : (
        <p className="field-help">{t('m5s3.map.chooseHelp')}</p>
      )}
      <p className="field-help">{t('m5s3.map.attribution')}</p>
    </div>
  );
}
