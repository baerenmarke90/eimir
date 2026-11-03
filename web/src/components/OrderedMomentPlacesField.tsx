import { useTranslation } from '../i18n';
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
  ...props
}: Omit<Parameters<typeof MomentPlaceField>[0], 'value' | 'onChange'> & {
  value: MomentPlaceSelection[];
  onChange: (places: MomentPlaceSelection[]) => void;
  onNavigate?: (proceed: () => void) => void;
}) {
  const { t } = useTranslation();
  function move(index: number, offset: number) {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  return (
    <fieldset className="ordered-moment-places">
      <legend>{t('experiences.places')}</legend>
      <ol>
        {value.map((place, index) => (
          <li key={place.id}>
            <strong>{place.name}</strong>
            {place.address ? <span>{place.address}</span> : null}
            <div className="photo-draft-controls">
              <button
                type="button"
                className="tertiary"
                disabled={props.disabled || index === 0}
                aria-label={t('experiences.placeEarlier', { name: place.name })}
                onClick={() => move(index, -1)}
              >
                {t('experiences.earlier')}
              </button>
              <button
                type="button"
                className="tertiary"
                disabled={props.disabled || index === value.length - 1}
                aria-label={t('experiences.placeLater', { name: place.name })}
                onClick={() => move(index, 1)}
              >
                {t('experiences.later')}
              </button>
              {onNavigate ? (
                <MomentPlaceActionsMenu
                  place={place}
                  disabled={props.disabled}
                  onNavigate={onNavigate}
                  onRemove={() =>
                    onChange(value.filter((item) => item.id !== place.id))
                  }
                />
              ) : (
                <button
                  type="button"
                  className="tertiary"
                  disabled={props.disabled}
                  aria-label={t('experiences.removePlace', {
                    name: place.name,
                  })}
                  onClick={() =>
                    onChange(value.filter((item) => item.id !== place.id))
                  }
                >
                  {t('memory.photoRemove')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <MomentPlaceField
        {...props}
        disabled={props.disabled || value.length >= 20}
        onChange={(place) => {
          if (place && !value.some((item) => item.id === place.id))
            onChange([...value, place]);
        }}
      />
    </fieldset>
  );
}
