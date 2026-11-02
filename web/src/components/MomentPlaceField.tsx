import { useMemo, useRef, useState } from 'react';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { Configuration } from '../client/apiConfiguration';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { PlaceChoicePicker } from './PlaceChoicePicker';
import { ShortTaskSheet } from './ShortTaskSheet';
import './MomentPlaces.css';

export type MomentPlaceSelection = Pick<PlaceDetail, 'id' | 'name' | 'address'>;

/** Selection belongs to the composer's draft; the create transaction links it. */
export function MomentPlaceField({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  value,
  onChange,
  disabled = false,
  onPendingChange,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  value?: MomentPlaceSelection;
  onChange: (place: MomentPlaceSelection | undefined) => void;
  disabled?: boolean;
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
  return (
    <div className="moment-place-field">
      <button
        ref={trigger}
        type="button"
        className="secondary moment-place-add"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <EimirIcon name="orte" />
        <span>{value ? value.name : t('photoPlaces.add')}</span>
      </button>
      {value ? (
        <button
          type="button"
          className="tertiary"
          disabled={disabled}
          onClick={() => onChange(undefined)}
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
            queryKey={['moment-place-choice', apiBaseUrl, accountId, spaceId]}
            offline={!navigator.onLine}
            onPendingChange={(next) => {
              setPending(next);
              onPendingChange(next);
            }}
            onChoose={(place) => {
              onChange({
                id: place.id,
                name: place.name,
                address: place.address,
              });
              setPending(false);
              onPendingChange(false);
              setOpen(false);
            }}
          />
        ) : null}
      </ShortTaskSheet>
    </div>
  );
}
