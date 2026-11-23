import { useId } from 'react';
import type { PlanAnticipation } from '../api/generated/models/PlanAnticipation';
import { useTranslation } from '../i18n';
import './PlanAnticipationChoice.css';

const OPTIONS = [
  ['AUTOMATIC', 'automatic'],
  ['ALWAYS', 'always'],
  ['NEVER', 'never'],
] as const satisfies readonly (readonly [PlanAnticipation, string])[];

/**
 * The Plan's countdown preference on Wir (#2158 D): the next Plan shows
 * automatically, a pin wins over it, and "never" keeps a Plan off Wir.
 */
export function PlanAnticipationChoice({
  value,
  discreet,
  disabled = false,
  onChange,
}: {
  value: PlanAnticipation;
  discreet: boolean;
  disabled?: boolean;
  onChange: (value: PlanAnticipation) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const helpId = `${id}-help`;
  const help =
    value === 'AUTOMATIC'
      ? discreet
        ? 'automaticDiscreetHelp'
        : 'automaticHelp'
      : value === 'ALWAYS'
        ? 'alwaysHelp'
        : 'neverHelp';
  return (
    <fieldset
      className="plan-anticipation-choice"
      disabled={disabled}
      aria-describedby={helpId}
    >
      <legend>{t('relationshipReflections.anticipation.choiceLabel')}</legend>
      <div className="plan-anticipation-choice-options">
        {OPTIONS.map(([option, label]) => (
          <label key={option}>
            <input
              type="radio"
              name={`${id}-anticipation`}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{t(`relationshipReflections.anticipation.${label}`)}</span>
          </label>
        ))}
      </div>
      <p id={helpId} className="plan-anticipation-choice-help">
        {t(`relationshipReflections.anticipation.${help}`)}
      </p>
    </fieldset>
  );
}
