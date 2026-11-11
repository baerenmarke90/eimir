import { type ReactNode, useRef, useState } from 'react';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MomentPlaceActionsMenu } from './MomentPlaceActionsMenu';
import {
  MomentPlaceField,
  type MomentPlaceSelection,
} from './MomentPlaceField';

/** Several existing typed Places in a draft, never a second location model. */
export function OrderedMomentPlacesField({
  value,
  onChange,
  onNavigate,
  presentation = 'default',
  renderSelection,
  renderTrigger,
  ...props
}: Omit<Parameters<typeof MomentPlaceField>[0], 'value' | 'onChange'> & {
  presentation?: 'default' | 'composer';
  renderSelection?: (
    places: readonly MomentPlaceSelection[],
    open: () => void,
  ) => ReactNode;
  value: MomentPlaceSelection[];
  onChange: (places: MomentPlaceSelection[]) => void;
  onNavigate?: (proceed: () => void) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  function move(index: number, offset: number) {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  const editor = (
    <fieldset className="ordered-moment-places">
      <legend className="sr-only">{t('experiences.places')}</legend>
      <ol>
        {value.map((place, index) => (
          <li key={place.id}>
            <EimirIcon name="orte" className="moment-place-pin" />
            <div className="moment-place-context">
              <strong>{place.name}</strong>
              {place.address ? (
                <span className="muted">{place.address}</span>
              ) : null}
            </div>
            <div className="ordered-moment-place-controls">
              {onNavigate ? (
                <MomentPlaceActionsMenu
                  place={place}
                  disabled={props.disabled}
                  onNavigate={onNavigate}
                />
              ) : null}
              <button
                type="button"
                className="tertiary moment-place-remove"
                disabled={props.disabled}
                aria-label={t('experiences.removePlace', {
                  name: place.name,
                })}
                title={t('experiences.removePlace', { name: place.name })}
                onClick={() =>
                  onChange(value.filter((item) => item.id !== place.id))
                }
              >
                <EimirIcon name="trash" />
              </button>
            </div>
            {value.length > 1 ? (
              <div className="ordered-moment-place-reorder">
                <button
                  type="button"
                  className="tertiary"
                  disabled={props.disabled || index === 0}
                  aria-label={t('experiences.placeEarlier', {
                    name: place.name,
                  })}
                  onClick={() => move(index, -1)}
                >
                  {t('experiences.earlier')}
                </button>
                <button
                  type="button"
                  className="tertiary"
                  disabled={props.disabled || index === value.length - 1}
                  aria-label={t('experiences.placeLater', {
                    name: place.name,
                  })}
                  onClick={() => move(index, 1)}
                >
                  {t('experiences.later')}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <MomentPlaceField
        {...props}
        embedded={presentation === 'composer'}
        onPendingChange={(next) => {
          setPending(next);
          props.onPendingChange(next);
        }}
        disabled={props.disabled || value.length >= 20}
        onChange={(place) => {
          if (place && !value.some((item) => item.id === place.id))
            onChange([...value, place]);
        }}
      />
    </fieldset>
  );
  if (presentation !== 'composer') return editor;
  return (
    <>
      {renderSelection?.(value, () => setOpen(true))}
      {renderTrigger?.(() => setOpen(true))}
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={t('photoPlaces.add')}
        onClose={() => setOpen(false)}
        isCloseBlocked={pending}
        footer={
          <button
            type="button"
            disabled={pending}
            onClick={() => sheet.current?.requestClose()}
          >
            {t('experiences.finish')}
          </button>
        }
      >
        {editor}
      </ShortTaskSheet>
    </>
  );
}
