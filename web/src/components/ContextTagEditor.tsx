import {
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ContextTagSuggestionsView } from '../api/generated/models/ContextTagSuggestionsView';
import { useApiRuntime } from '../client/apiRuntimeContext';
import { useContextTagSuggestions } from '../client/useContextTagSuggestions';
import { useTranslation } from '../i18n';
import './MemoryTagChoices.css';
import { AddActionButton } from './AddAction';

const MAX_TAGS = 8;
const MAX_LABEL_LENGTH = 40;
const normalize = (value: string) =>
  value.trim().split(/\s+/u).join(' ').normalize('NFC');

export interface ContextTagEditorHandle {
  /** Forms owning this handle commit on submit, without moving the pressed button on blur. */
  commitDraft(): string[] | null;
}

type ContextTagEditorProps = {
  selected: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions: readonly string[];
  labelForTag: (tag: string) => string;
  disabled?: boolean;
  discloseEmpty?: boolean;
  onDraftChange?: (dirty: boolean) => void;
  draftValue?: string;
  onDraftValueChange?: (value: string) => void;
  ref?: Ref<ContextTagEditorHandle>;
  parentType?: 'MEMORY' | 'HEART_MOMENT' | 'PLAN' | 'WISH';
  parentId?: string;
};

export function ContextTagEditor(props: ContextTagEditorProps) {
  const runtime = useApiRuntime();
  return runtime?.accountId && runtime.spaceId ? (
    <SuggestedContextTagEditor {...props} />
  ) : (
    <ContextTagEditorContent {...props} />
  );
}

function SuggestedContextTagEditor(props: ContextTagEditorProps) {
  const learned = useContextTagSuggestions(props.parentType, props.parentId);
  return <ContextTagEditorContent {...props} learned={learned} />;
}

function ContextTagEditorContent({
  selected,
  onChange,
  suggestions,
  labelForTag,
  disabled = false,
  discloseEmpty = false,
  onDraftChange,
  draftValue,
  onDraftValueChange,
  ref,
  learned,
}: ContextTagEditorProps & { learned?: ContextTagSuggestionsView }) {
  const { t } = useTranslation();
  const offered = Array.from(
    new Set([...(learned?.learned ?? []), ...suggestions]),
  );
  const id = useId();
  const [localDraft, setLocalDraft] = useState('');
  const draft = draftValue ?? localDraft;
  function setDraft(value: string) {
    setLocalDraft(value);
    onDraftValueChange?.(value);
  }
  const [error, setError] = useState('');
  const [entryExpanded, setEntryExpanded] = useState(false);
  const entryVisible =
    !discloseEmpty ||
    entryExpanded ||
    selected.length > 0 ||
    Boolean(draft) ||
    Boolean(error);
  const entryId = `${id}-entry`;
  const focusOnExpand = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (entryVisible && focusOnExpand.current) {
      focusOnExpand.current = false;
      inputRef.current?.focus();
    }
  }, [entryVisible]);
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
    <fieldset
      className={`memory-tag-choices${discloseEmpty ? ' context-tag-disclosure' : ''}`}
      disabled={disabled}
    >
      <legend className={entryVisible ? undefined : 'sr-only'}>
        {t('contextTags.label')}
      </legend>
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
                  setEntryExpanded(true);
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
      {!entryVisible ? (
        <AddActionButton
          label={t('contextTags.add')}
          icon="tag"
          aria-expanded={false}
          aria-controls={entryId}
          onClick={() => {
            focusOnExpand.current = true;
            setEntryExpanded(true);
          }}
        />
      ) : null}
      <div id={entryId} hidden={!entryVisible}>
        <label className="sr-only" htmlFor={id}>
          {t('contextTags.newLabel')}
        </label>
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
              const next = event.relatedTarget;
              if (
                ref &&
                (next instanceof HTMLButtonElement ||
                  next instanceof HTMLInputElement) &&
                next.type === 'submit' &&
                next.form === event.currentTarget.form
              )
                return;
              if (event.relatedTarget !== addRef.current && draft.trim())
                commit(true);
            }}
          />
          <AddActionButton
            ref={addRef}
            label={t('contextTags.add')}
            icon="tag"
            onClick={() => commit()}
          />
        </div>
        {error ? (
          <p className="field-error" id={`${id}-error`} role="alert">
            {error}
          </p>
        ) : null}
        <details className="context-tag-suggestions">
          <summary>{t('contextTags.suggestions')}</summary>
          <div className="memory-tag-list">
            {offered.map((tag) => (
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
          {learned?.proposed.length ? (
            <>
              <p className="field-help">{t('contextTags.proposed')}</p>
              <div className="memory-tag-list">
                {learned.proposed
                  .filter((tag) => !offered.includes(tag))
                  .map((tag) => (
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
                              : selected.filter((value) => value !== tag),
                          )
                        }
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
              </div>
            </>
          ) : null}
        </details>
      </div>
    </fieldset>
  );
}
