import { useId } from 'react';
import type { DiscreetTitleMode } from '../api/generated/models/DiscreetTitleMode';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { PreferenceSwitch } from './PreferenceSwitch';
import { useSensitiveMediaReveals } from './SensitiveMedia';
import './DiscreetPlan.css';

/** The only marker outside the editor: a small lock, never a visible label. */
export function DiscreetLock({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={`discreet-lock ${className}`}
      role="img"
      aria-label={t('discreetPlans.lockLabel')}
    >
      <EimirIcon name="lock" />
    </span>
  );
}

/** Neutral lines in place of the description; never blurred real text. */
export function DiscreetPlaceholderLines({
  className = '',
}: {
  className?: string;
}) {
  return (
    <span className={`discreet-lines ${className}`} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

/**
 * A per-view reveal built on the sensitive-media reveal: it is never
 * persisted and conceals again when the app goes to the background or the
 * view changes identity or unmounts.
 */
export function useDiscreetReveal(identity: string, enabled: boolean) {
  const reveals = useSensitiveMediaReveals(identity, enabled);
  const revealed = reveals.isRevealed('plan');
  return {
    revealed,
    concealed: enabled && !revealed,
    toggle: () => reveals.toggle('plan'),
  };
}

export interface DiscreetDraft {
  discreet: boolean;
  titleMode: DiscreetTitleMode;
  previewTitle: string;
}

export function DiscreetPlanEditor({
  value,
  onChange,
  suggestions,
  disabled = false,
}: {
  value: DiscreetDraft;
  onChange: (value: DiscreetDraft) => void;
  suggestions: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const previewId = `${id}-preview`;
  const helpId = `${id}-help`;
  return (
    <div className="discreet-editor">
      <PreferenceSwitch
        label={t('discreetPlans.editor.label')}
        description={t('discreetPlans.editor.help')}
        checked={value.discreet}
        disabled={disabled}
        onCheckedChange={(discreet) =>
          onChange({
            ...value,
            discreet,
            // First activation prefills the first neutral suggestion.
            previewTitle:
              discreet && !value.previewTitle.trim()
                ? (suggestions[0] ?? '')
                : value.previewTitle,
          })
        }
      />
      {value.discreet ? (
        <div className="discreet-editor-options">
          <fieldset className="discreet-title-choice" disabled={disabled}>
            <legend>{t('discreetPlans.editor.titleChoice')}</legend>
            <div className="discreet-title-choice-options">
              {(['PREVIEW', 'ORIGINAL'] as const).map((mode) => (
                <label key={mode}>
                  <input
                    type="radio"
                    name={`${id}-title-mode`}
                    value={mode}
                    checked={value.titleMode === mode}
                    onChange={() => onChange({ ...value, titleMode: mode })}
                  />
                  <span>
                    {t(
                      mode === 'PREVIEW'
                        ? 'discreetPlans.editor.preview'
                        : 'discreetPlans.editor.original',
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {value.titleMode === 'PREVIEW' ? (
            <div className="discreet-preview-title">
              <label htmlFor={previewId}>
                {t('discreetPlans.editor.previewTitle')}
              </label>
              <input
                id={previewId}
                maxLength={200}
                value={value.previewTitle}
                placeholder={t('discreetPlans.editor.previewPlaceholder')}
                aria-describedby={helpId}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...value, previewTitle: event.target.value })
                }
              />
              <ul
                className="discreet-suggestions"
                aria-label={t('discreetPlans.editor.suggestionsLabel')}
              >
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      className="discreet-suggestion"
                      aria-pressed={value.previewTitle.trim() === suggestion}
                      disabled={disabled}
                      onClick={() =>
                        onChange({ ...value, previewTitle: suggestion })
                      }
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
              <p id={helpId} className="discreet-editor-help">
                {t('discreetPlans.editor.suggestionsHelp')}
              </p>
            </div>
          ) : (
            <p className="discreet-editor-help">
              {t('discreetPlans.editor.originalHelp')}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
