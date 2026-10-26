import { useId, useRef, useState, useImperativeHandle, type Ref } from 'react';
import { useTranslation } from '../i18n';
import './MemoryTagChoices.css';

const MAX_TAGS = 8;
const MAX_LABEL_LENGTH = 40;
const normalize = (value: string) =>
  value.trim().split(/\s+/u).join(' ').normalize('NFC');

export interface ContextTagEditorHandle {
  commitDraft(): string[] | null;
}

export function ContextTagEditor({
  selected,
  onChange,
  suggestions,
  labelForTag,
  disabled = false,
  onDraftChange,
  draftValue,
  onDraftValueChange,
  ref,
}: {
  selected: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions: readonly string[];
  labelForTag: (tag: string) => string;
  disabled?: boolean;
  onDraftChange?: (dirty: boolean) => void;
  draftValue?: string;
  onDraftValueChange?: (value: string) => void;
  ref?: Ref<ContextTagEditorHandle>;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [localDraft, setLocalDraft] = useState('');
  const draft = draftValue ?? localDraft;
  function setDraft(value: string) {
    setLocalDraft(value);
    onDraftValueChange?.(value);
  }
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  function commit(allowEmpty = false): string[] | null {
    const value = normalize(draft);
    const message = !value
      ? allowEmpty
        ? ''
        : t('contextTags.empty')
      : Array.from(value).length > MAX_LABEL_LENGTH
        ? t('contextTags.tooLong', { count: MAX_LABEL_LENGTH })
        : selected.includes(value)
          ? t('contextTags.duplicate')
          : selected.length >= MAX_TAGS
            ? t('contextTags.tooMany', { count: MAX_TAGS })
            : '';
    setError(message);
    inputRef.current?.setCustomValidity(value ? message : '');
    if (message) return null;
    if (!value) return [...selected];
    const result = [...selected, value];
    onChange(result);
    setDraft('');
    onDraftChange?.(false);
    return result;
  }
  useImperativeHandle(ref, () => ({
    commitDraft() {
      const result = commit(true);
      if (result === null) {
        inputRef.current?.focus();
        inputRef.current?.reportValidity();
      }
      return result;
    },
  }));
  return (
    <fieldset className="memory-tag-choices" disabled={disabled}>
      <legend>{t('contextTags.label')}</legend>
      <p className="field-help">{t('contextTags.help')}</p>
      {selected.length ? (
        <ul className="context-tag-selected memory-tag-list">
          {selected.map((tag) => (
            <li key={tag}>
              <input type="hidden" name="tags" value={tag} />
              <button
                type="button"
                className="context-tag-remove"
                aria-label={t('contextTags.remove', { tag: labelForTag(tag) })}
                onClick={() => {
                  onChange(selected.filter((entry) => entry !== tag));
                  setError('');
                  inputRef.current?.setCustomValidity('');
                  inputRef.current?.focus({ preventScroll: true });
                }}
              >
                <span>{labelForTag(tag)}</span>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={id}>{t('contextTags.newLabel')}</label>
      <div className="context-tag-entry">
        <input
          ref={inputRef}
          id={id}
          value={draft}
          placeholder={t('contextTags.placeholder')}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setError('');
            event.target.setCustomValidity('');
            onDraftChange?.(Boolean(event.target.value));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={(event) => {
            if (event.relatedTarget !== addRef.current && draft.trim())
              commit(true);
          }}
        />
        <button
          ref={addRef}
          type="button"
          className="secondary"
          onClick={() => commit()}
        >
          {t('contextTags.add')}
        </button>
      </div>
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
      <details className="context-tag-suggestions">
        <summary>{t('contextTags.suggestions')}</summary>
        <div className="memory-tag-list">
          {suggestions.map((tag) => (
            <label className="memory-tag-choice" key={tag}>
              <input
                type="checkbox"
                checked={selected.includes(tag)}
                disabled={
                  !selected.includes(tag) && selected.length >= MAX_TAGS
                }
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, tag]
                      : selected.filter((entry) => entry !== tag),
                  )
                }
              />
              <span>{labelForTag(tag)}</span>
            </label>
          ))}
        </div>
      </details>
    </fieldset>
  );
}
