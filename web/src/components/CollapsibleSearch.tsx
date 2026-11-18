import { type RefObject, useId, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './PlanningReference.css';

/**
 * The search that rests as an icon at the end of a status row and unfolds into
 * a field on demand. It is positioned against the nearest `.planen-panel`, so
 * the panel's status row makes room for it; Planning and Shared Notes share it.
 */
export function CollapsibleSearch({
  label,
  clearLabel,
  value,
  onChange,
  inputRef,
  maxLength,
}: {
  label: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
  /** Lets the owner return focus to the field, for example after clearing. */
  inputRef?: RefObject<HTMLInputElement | null>;
  maxLength?: number;
}) {
  const { t } = useTranslation();
  const id = useId();
  const ownRef = useRef<HTMLInputElement>(null);
  const fieldRef = inputRef ?? ownRef;
  // The search rests as an icon on the status row and opens on
  // demand, so the first entry sits one row higher.
  const [open, setOpen] = useState(() => Boolean(value));
  const [closing, setClosing] = useState(false);
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  if (!open && !value) {
    return (
      <button
        type="button"
        className="planen-search-toggle"
        aria-label={label}
        aria-expanded={false}
        onClick={() => {
          setFocusOnOpen(true);
          setClosing(false);
          setOpen(true);
        }}
      >
        <EimirIcon name="suche" />
      </button>
    );
  }
  return (
    <search
      className={`planen-search${closing ? ' is-closing' : ''}`}
      onAnimationEnd={(event) => {
        // The field folds away first and only then gives way to the icon.
        if (closing && event.target === event.currentTarget) {
          setClosing(false);
          setOpen(false);
        }
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="planen-search-field">
        <EimirIcon name="suche" />
        <input
          ref={fieldRef}
          id={id}
          type="search"
          enterKeyHint="search"
          // One question for every search; the accessible name stays specific.
          placeholder={t('navigation.searchPrompt')}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setClosing(false)}
          onBlur={() => {
            if (value) return;
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
              setOpen(false);
            } else {
              setClosing(true);
            }
          }}
          // biome-ignore lint/a11y/noAutofocus: focus follows the user's own tap on the search icon.
          autoFocus={focusOnOpen}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            className="tertiary"
            aria-label={clearLabel}
            onClick={() => {
              onChange('');
              fieldRef.current?.focus();
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    </search>
  );
}
