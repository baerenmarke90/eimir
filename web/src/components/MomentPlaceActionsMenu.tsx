import { type RefObject, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { photoPlaceMapUrl } from '../client/photoPlaces';
import { placeDetailPath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MomentMapLink } from './MomentMapLink';
import type { MomentPlaceSelection } from './MomentPlaceField';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

/** The same contextual actions for saved relations and an editor's local draft. */
export function MomentPlaceActionsMenu({
  place,
  disabled = false,
  offline = false,
  restoreFocusRef,
  onNavigate,
  onRemove,
}: {
  place: MomentPlaceSelection;
  disabled?: boolean;
  offline?: boolean;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  onNavigate?: (proceed: () => void) => void;
  onRemove?: () => unknown | Promise<unknown>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mapUrl = photoPlaceMapUrl(
    place.latitude ?? null,
    place.longitude ?? null,
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tertiary moment-place-overflow"
        aria-label={t('photoPlaces.actions', { name: place.name })}
        title={t('photoPlaces.actions', { name: place.name })}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled || pending}
        onClick={() => {
          setOpen(true);
          setConfirm(false);
          setError(null);
        }}
      >
        <EimirIcon name="overflow" className="inline-icon" />
      </button>
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={place.name}
        onClose={() => setOpen(false)}
        isCloseBlocked={pending}
        restoreFocusRef={restoreFocusRef ?? trigger}
      >
        <div className="moment-place-actions">
          {confirm ? (
            <>
              <p>{t('photoPlaces.removeHint')}</p>
              <button
                type="button"
                className="destructive"
                disabled={disabled || pending || offline}
                onClick={async () => {
                  if (disabled || offline || inFlight.current || !onRemove)
                    return;
                  inFlight.current = true;
                  setPending(true);
                  try {
                    await onRemove();
                    setOpen(false);
                  } catch (failure) {
                    setError(failure);
                  } finally {
                    inFlight.current = false;
                    setPending(false);
                  }
                }}
              >
                {t('photoPlaces.remove')}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={() => setConfirm(false)}
              >
                {t('photoPlaces.cancel')}
              </button>
            </>
          ) : (
            <>
              <Link
                className="button-link secondary-link"
                to={placeDetailPath(place.id)}
                onClick={(event) => {
                  event.preventDefault();
                  sheet.current?.closeForNavigation(() => {
                    const proceed = () => {
                      const taskOriginKey = captureOrigin();
                      void navigate(placeDetailPath(place.id), {
                        state: { taskOriginKey },
                      });
                    };
                    if (onNavigate) onNavigate(proceed);
                    else proceed();
                  });
                }}
              >
                {t('photoPlaces.edit')}
              </Link>
              {mapUrl ? (
                <MomentMapLink
                  className="button-link secondary-link"
                  to={mapUrl}
                  onNavigate={(proceed) =>
                    sheet.current?.closeForNavigation(() =>
                      onNavigate ? onNavigate(proceed) : proceed(),
                    )
                  }
                >
                  {t('photoPlaces.maps')}
                </MomentMapLink>
              ) : null}
              {onRemove ? (
                <button
                  type="button"
                  className="tertiary"
                  disabled={disabled || offline}
                  onClick={() => setConfirm(true)}
                >
                  {t('photoPlaces.remove')}
                </button>
              ) : null}
            </>
          )}
          {offline ? <p role="status">{t('photoPlaces.offline')}</p> : null}
          {error ? <ProblemState error={error} /> : null}
        </div>
      </ShortTaskSheet>
    </>
  );
}
