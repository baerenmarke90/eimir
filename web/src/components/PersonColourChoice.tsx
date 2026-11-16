import { useId } from 'react';
import {
  PERSON_COLOUR_PAIRS,
  type PersonColourPairId,
  type PersonToneId,
  personColourPair,
} from '../client/personColours';
import { useTranslation } from '../i18n';
import { ProMark } from './ProMark';
import './PersonColourChoice.css';

const AUTOMATIC = 'automatic';

export function Swatches({
  own,
  partner,
}: {
  own: PersonToneId;
  partner: PersonToneId;
}) {
  return (
    <span className="person-colour-swatches" aria-hidden="true">
      <span
        className="person-colour-swatch"
        style={{ background: `var(--color-person-${own})` }}
      />
      <span
        className="person-colour-swatch"
        style={{ background: `var(--color-person-${partner})` }}
      />
    </span>
  );
}

/**
 * One fixed colour pair for the signed-in person's own view: their own colour
 * first, then their partner's. The choice is personal and never shared. Every
 * row names both colours in words, so the colour never carries the meaning alone.
 */
export function PersonColourChoice({
  value,
  disabled = false,
  onChange,
}: {
  value: PersonColourPairId | null;
  disabled?: boolean;
  onChange: (next: PersonColourPairId | null) => void;
}) {
  const { t } = useTranslation();
  const name = useId();
  const tone = (id: PersonToneId) => t(`personColours.tone.${id}`);
  const options: { id: PersonColourPairId | null; key: string }[] = [
    { id: null, key: AUTOMATIC },
    ...PERSON_COLOUR_PAIRS.map((id) => ({ id, key: id })),
  ];
  return (
    <fieldset className="person-colour-choice" disabled={disabled}>
      <legend className="sr-only">{t('personColours.choices')}</legend>
      <div className="person-colour-options">
        {options.map((option) => {
          const pair = personColourPair(option.id);
          const own = tone(pair.own);
          const partner = tone(pair.partner);
          const automatic = option.id === null;
          return (
            <label key={option.key} className="person-colour-option">
              <input
                type="radio"
                name={name}
                checked={value === option.id}
                onChange={() => onChange(option.id)}
              />
              <Swatches own={pair.own} partner={pair.partner} />
              <span className="person-colour-text">
                <span className="person-colour-label">
                  {automatic
                    ? t('personColours.automatic')
                    : t('personColours.pair', { own, partner })}{' '}
                  {automatic ? null : (
                    <ProMark label={t('personColours.pro')} />
                  )}
                </span>
                <span className="person-colour-hint">
                  {t('personColours.hint', { own, partner })}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
