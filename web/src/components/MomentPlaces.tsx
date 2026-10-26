import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { PlaceRelationsApi } from '../api/generated/apis/PlaceRelationsApi';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { ResponseError } from '../api/generated/runtime';
import { Configuration } from '../client/apiConfiguration';
import { invalidatePlaceConsumers } from '../client/authorSummaryConsumers';
import {
  manualPlace,
  placeDisplayName,
  placeMapsUrl,
} from '../client/photoLocations';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import './MomentPlaces.css';

export function MomentPlaces({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  targetId,
  kind,
  offline = false,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  targetId: string;
  kind: 'memory' | 'heartMoment' | 'milestone';
  offline?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const apis = useMemo(() => {
    const configuration = new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      places: new PlacesApi(configuration),
      relations: new PlaceRelationsApi(configuration),
    };
  }, [apiBaseUrl, accessToken]);
  const key = [
    'moment-places',
    apiBaseUrl,
    accountId,
    spaceId,
    kind,
    targetId,
  ] as const;
  const request = { spaceId, targetId };
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      kind === 'memory'
        ? apis.relations.listMemoryPlaces(request, { signal })
        : kind === 'heartMoment'
          ? apis.relations.listHeartMomentPlaces(request, { signal })
          : apis.relations.listMilestonePlaces(request, { signal }),
    enabled: !offline,
    retry: false,
    gcTime: 0,
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlaceDetail | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [existingId, setExistingId] = useState('');
  const [invalidLink, setInvalidLink] = useState(false);
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const draftTarget = useRef<string | null>(null);
  const stagedPlace = useRef<{
    fingerprint: string;
    place: PlaceDetail;
  } | null>(null);
  const choicesKey = ['place-choices', apiBaseUrl, accountId, spaceId] as const;
  const choices = useQuery({
    queryKey: choicesKey,
    queryFn: ({ signal }) =>
      apis.places.listPlaces({ spaceId, limit: 100 }, { signal }),
    enabled: open && !offline,
    retry: false,
    gcTime: 0,
  });
  const link = (placeId: string) => {
    const parameters = { ...request, placeId };
    return kind === 'memory'
      ? apis.relations.linkPlaceMemory(parameters)
      : kind === 'heartMoment'
        ? apis.relations.linkPlaceHeartMoment(parameters)
        : apis.relations.linkPlaceMilestone(parameters);
  };
  const unlink = (placeId: string) => {
    const parameters = { ...request, placeId };
    return kind === 'memory'
      ? apis.relations.unlinkPlaceMemory(parameters)
      : kind === 'heartMoment'
        ? apis.relations.unlinkPlaceHeartMoment(parameters)
        : apis.relations.unlinkPlaceMilestone(parameters);
  };
  const mutation = useMutation({
    mutationFn: async (action: { remove: PlaceDetail } | { save: true }) => {
      if (offline || !navigator.onLine) throw new Error('Connection required');
      const ownsQuery = captureAuthorizedQuery(client, key);
      const requireOwner = () => {
        if (!ownsQuery()) throw new Error('Place task ended');
      };
      requireOwner();
      const unlinkVerified = async (placeId: string) => {
        try {
          await unlink(placeId);
        } catch (error) {
          requireOwner();
          const current = await query.refetch();
          if (
            current.error ||
            !current.data ||
            current.data.items.some((place) => place.id === placeId)
          )
            throw error;
        }
      };
      if ('remove' in action) {
        await unlinkVerified(action.remove.id);
      } else {
        let placeId = existingId;
        if (!placeId) {
          const values = manualPlace(name, address);
          if (
            editing &&
            !address.trim() &&
            editing.latitude != null &&
            editing.longitude != null
          ) {
            values.latitude = editing.latitude;
            values.longitude = editing.longitude;
          }
          const fingerprint = JSON.stringify(values);
          if (stagedPlace.current?.fingerprint !== fingerprint) {
            if (uncertainCreate)
              throw new Error('Place creation outcome is unknown');
            let place: PlaceDetail;
            try {
              place = await apis.places.createPlace({
                spaceId,
                placeCreate: values,
              });
            } catch (error) {
              if (
                !(
                  error instanceof ResponseError &&
                  error.response.status >= 400 &&
                  error.response.status < 500
                )
              )
                setUncertainCreate(true);
              throw error;
            }
            requireOwner();
            stagedPlace.current = { fingerprint, place };
          }
          placeId = stagedPlace.current.place.id;
        }
        if (placeId !== editing?.id) {
          requireOwner();
          await link(placeId);
          requireOwner();
          if (editing) await unlinkVerified(editing.id);
        }
      }
      requireOwner();
      await query.refetch();
      await invalidatePlaceConsumers(client, spaceId);
      await client.invalidateQueries({ queryKey: choicesKey });
      setOpen(false);
      draftTarget.current = null;
      stagedPlace.current = null;
      setUncertainCreate(false);
    },
  });
  function edit(place: PlaceDetail | null) {
    mutation.reset();
    setInvalidLink(false);
    const target = place?.id ?? 'new';
    if (draftTarget.current !== target) {
      setName(place ? placeDisplayName(place) : '');
      setAddress(place?.mapUrl ?? place?.address ?? '');
      setExistingId('');
      draftTarget.current = target;
      stagedPlace.current = null;
    }
    setEditing(place);
    setOpen(true);
  }

  return (
    <section className="moment-places" aria-label={t('photoLocations.heading')}>
      {query.isPending && !offline ? (
        <p role="status" className="field-help">
          {t('photoLocations.loadingPlaces')}
        </p>
      ) : null}
      {query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data?.items.map((place) => (
        <div key={place.id} className="moment-place">
          <div className="moment-place-heading">
            <DestinationIcon icon="places" />
            <strong>{placeDisplayName(place)}</strong>
          </div>
          {place.address ? <p className="field-help">{place.address}</p> : null}
          <a
            href={placeMapsUrl(place)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('photoLocations.maps')}
          </a>
          {!offline ? (
            <div className="moment-place-actions">
              <button
                type="button"
                className="button-link tertiary"
                disabled={mutation.isPending}
                onClick={() => edit(place)}
              >
                {t('photoLocations.change')}
              </button>
              <button
                type="button"
                className="button-link tertiary"
                disabled={mutation.isPending}
                onClick={() => {
                  mutation.reset();
                  mutation.mutate({ remove: place });
                }}
              >
                {t('photoLocations.remove')}
              </button>
            </div>
          ) : null}
        </div>
      ))}
      {query.data?.items.length ? (
        <p className="field-help">{t('photoLocations.mapsHint')}</p>
      ) : null}
      {offline && !query.data ? (
        <p className="field-help">{t('photoLocations.offlinePlaces')}</p>
      ) : null}
      {!offline && query.data && !query.error ? (
        <button
          type="button"
          className="button-link tertiary"
          disabled={mutation.isPending}
          onClick={() => edit(null)}
        >
          {t('photoLocations.add')}
        </button>
      ) : null}
      {mutation.error && !open ? (
        <ProblemState
          error={mutation.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      <ShortTaskSheet
        open={open}
        title={t('photoLocations.editTitle')}
        onClose={() => setOpen(false)}
        isCloseBlocked={mutation.isPending}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              if (!existingId) manualPlace(name, address);
            } catch {
              setInvalidLink(true);
              return;
            }
            setInvalidLink(false);
            mutation.reset();
            mutation.mutate({ save: true });
          }}
        >
          <fieldset
            disabled={mutation.isPending}
            className="moment-place-fields"
          >
            <legend className="sr-only">{t('photoLocations.editTitle')}</legend>
            <label>
              {t('photoLocations.chooseExisting')}
              <select
                value={existingId}
                onChange={(event) => setExistingId(event.target.value)}
              >
                <option value="">
                  {t('photoLocations.existingPlaceholder')}
                </option>
                {choices.data?.items.map((place) => (
                  <option key={place.id} value={place.id}>
                    {placeDisplayName(place)}
                  </option>
                ))}
              </select>
            </label>
            {choices.error ? (
              <ProblemState
                error={choices.error}
                onRetry={() => void choices.refetch()}
              />
            ) : null}
            {uncertainCreate ? (
              <div role="status">
                <p>{t('photoLocations.uncertainCreate')}</p>
                <button
                  type="button"
                  className="button-link tertiary"
                  onClick={() => void choices.refetch()}
                >
                  {t('photoLocations.reloadPlaces')}
                </button>
              </div>
            ) : null}
            {!existingId ? (
              <>
                <label>
                  {t('photoLocations.name')}
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={200}
                    placeholder={t('photoLocations.namePlaceholder')}
                  />
                </label>
                <label>
                  {t('photoLocations.address')}
                  <input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    maxLength={2048}
                    placeholder={t('photoLocations.addressPlaceholder')}
                    aria-invalid={invalidLink || undefined}
                  />
                </label>
              </>
            ) : null}
            {invalidLink ? (
              <p role="alert">{t('photoLocations.invalidLink')}</p>
            ) : null}
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!existingId && (!name.trim() || uncertainCreate)}
              >
                {t(
                  mutation.isPending ? 'common.saving' : 'photoLocations.save',
                )}
              </button>
            </div>
          </fieldset>
          {mutation.error ? <ProblemState error={mutation.error} /> : null}
        </form>
      </ShortTaskSheet>
    </section>
  );
}
