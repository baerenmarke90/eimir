import { type ReactNode, useMemo, useRef, useState } from 'react';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { Configuration } from '../client/apiConfiguration';
import { useTranslation } from '../i18n';
import { AddActionContent } from './AddAction';
import { EimirIcon } from './EimirIcon';
import { PlaceChoicePicker } from './PlaceChoicePicker';
import { ShortTaskSheet } from './ShortTaskSheet';
import './MomentPlaces.css';

export type MomentPlaceSelection = Pick<
  PlaceDetail,
  'id' | 'name' | 'address'
> &
  Partial<Pick<PlaceDetail, 'latitude' | 'longitude'>>;

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
  renderTrigger,
  showSelection = true,
  embedded = false,
}: {
  renderTrigger?: (open: () => void) => ReactNode;
  showSelection?: boolean;
  embedded?: boolean;
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
  const picker = (
    <PlaceChoicePicker
      key={JSON.stringify([apiBaseUrl, accountId, spaceId])}
      api={api}
      confirmSharedCreate
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
          latitude: place.latitude,
          longitude: place.longitude,
        });
        setPending(false);
        onPendingChange(false);
        setOpen(false);
      }}
    />
  );
  if (embedded) return picker;
  return (
    <div className="moment-place-field">
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <button
          ref={trigger}
          type="button"
          className={value ? 'secondary moment-place-add' : 'add-action'}
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
      )}
      {value && showSelection ? (
        <button
          type="button"
          className="tertiary moment-place-remove"
          disabled={disabled}
          aria-label={t('experiences.removePlace', { name: value.name })}
          title={t('experiences.removePlace', { name: value.name })}
          onClick={() => onChange(undefined)}
        >
          <EimirIcon name="trash" />
        </button>
      ) : null}
      <ShortTaskSheet
        open={open && !disabled}
        title={t('photoPlaces.add')}
        restoreFocusRef={trigger}
        isCloseBlocked={pending}
        onClose={() => setOpen(false)}
      >
        {open && !disabled ? picker : null}
      </ShortTaskSheet>
    </div>
  );
}
