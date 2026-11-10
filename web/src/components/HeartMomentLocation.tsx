import { useMemo, useRef, useState } from 'react';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { HeartMomentLocation } from '../api/generated/models/HeartMomentLocation';
import { Configuration } from '../client/apiConfiguration';
import { photoPlaceMapUrl } from '../client/photoPlaces';
import { useTranslation } from '../i18n';
import { AddActionContent } from './AddAction';
import { EimirIcon } from './EimirIcon';
import { PlaceChoicePicker } from './PlaceChoicePicker';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { MomentMapLink } from './MomentMapLink';
import './MomentPlaces.css';

/** Copy only location content; shared Place identity never enters the private payload. */
export function locationFromPlace(
  place: HeartMomentLocation,
): HeartMomentLocation {
  return {
    name: place.name,
    address: place.address ?? null,
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
  };
}

export function HeartMomentLocationField({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  value,
  onChange,
  disabled = false,
  privateAudience = false,
  onPendingChange,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  value?: HeartMomentLocation | null;
  onChange: (value: HeartMomentLocation | null) => void;
  disabled?: boolean;
  privateAudience?: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const api = useMemo(
    () =>
      new PlacesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  function choose(location: HeartMomentLocation) {
    onChange(locationFromPlace(location));
    setPending(false);
    onPendingChange(false);
    setOpen(false);
  }
  return (
    <div className="moment-place-field">
      <button
        ref={trigger}
        type="button"
        className={value ? 'secondary moment-place-add' : 'add-action'}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {value ? (
          <>
            <EimirIcon name="orte" />
            <span>{value.name}</span>
          </>
        ) : (
          <AddActionContent label={t('photoPlaces.add')} icon="orte" />
        )}
      </button>
      {value ? (
        <button
          type="button"
          className="tertiary"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          {t('photoPlaces.removeSelection')}
        </button>
      ) : null}
      <ShortTaskSheet
        open={open && !disabled}
        title={t('photoPlaces.add')}
        restoreFocusRef={trigger}
        isCloseBlocked={pending}
        onClose={() => setOpen(false)}
      >
        {open && !disabled ? (
          <PlaceChoicePicker
            key={JSON.stringify([apiBaseUrl, accountId, spaceId])}
            api={api}
            spaceId={spaceId}
            queryKey={[
              'heart-moment-location-choice',
              apiBaseUrl,
              accountId,
              spaceId,
            ]}
            offline={!navigator.onLine}
            onChoose={choose}
            onChooseLocation={choose}
            locationHint={
              privateAudience
                ? t('heartMomentProduct.visibilityPrivate')
                : undefined
            }
            onPendingChange={(next) => {
              setPending(next);
              onPendingChange(next);
            }}
          />
        ) : null}
      </ShortTaskSheet>
    </div>
  );
}

export function HeartMomentLocationSummary({
  location,
}: {
  location: HeartMomentLocation;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const map = photoPlaceMapUrl(
    location.latitude ?? null,
    location.longitude ?? null,
  );
  return (
    <span className="moment-location">
      <button
        ref={trigger}
        type="button"
        className="tertiary moment-place-summary"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <EimirIcon name="orte" />
        <span>{location.name}</span>
      </button>
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={location.name}
        restoreFocusRef={trigger}
        onClose={() => setOpen(false)}
      >
        {location.address ? <p>{location.address}</p> : null}
        {map ? (
          <MomentMapLink
            className="moment-place-address"
            to={map}
            onNavigate={(proceed) => sheet.current?.closeForNavigation(proceed)}
          >
            {t('photoPlaces.viewMap')}
          </MomentMapLink>
        ) : null}
      </ShortTaskSheet>
    </span>
  );
}
