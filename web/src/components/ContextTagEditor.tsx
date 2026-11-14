import {
  type Ref,
  type ReactNode,
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
import { EimirIcon } from './EimirIcon';
import { AddActionButton } from './AddAction';
import { ComposerChip, ComposerTool } from './PageComposer';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

const MAX_TAGS = 8;
const MAX_LABEL_LENGTH = 40;
const normalize = (value: string) =>
  value.trim().split(/\s+/u).join(' ').normalize('NFC');

export interface ContextTagEditorHandle {
  /** Forms owning this handle commit on submit, without moving the pressed button on blur. */
  commitDraft(): string[] | null;
}

type ContextTagEditorProps = {
  presentation?: 'default' | 'composer';
  renderTrigger?: (open: () => void) => ReactNode;
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
  presentation = 'default',
  renderTrigger,
}: ContextTagEditorProps & { learned?: ContextTagSuggestionsView }) {
  const { t } = useTranslation();
  const offered = Array.from(
    new Set([
      ...(learned?.learned ?? []),
      ...suggestions,
      ...(presentation === 'composer' ? selected : []),
    ]),
  );
  const id = useId();
  const [open, setOpen] = useState(false);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const [localDraft, setLocalDraft] = useState('');
  const draft = draftValue ?? localDraft;
  function setDraft(value: string) {
    setLocalDraft(value);
    onDraftValueChange?.(value);
  }
  const [error, setError] = useState('');
  const [entryExpanded, setEntryExpanded] = useState(false);
  const entryVisible =
    presentation === 'composer' ||
    !discloseEmpty ||
    entryExpanded ||
    selected.length > 0 ||
    Boolean(draft) ||
    Boolean(error);
  const entryId = `${id}-entry`;
  const focusOnExpand = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open && error) inputRef.current?.focus();
  }, [open, error]);
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
        if (presentation === 'composer') setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.reportValidity();
      }
      return result;
    },
  }));
  const editor = (
    <fieldset
      className={`memory-tag-choices${discloseEmpty ? ' context-tag-disclosure' : ''}`}
      disabled={disabled}
    >
      <legend
        className={
          entryVisible && presentation !== 'composer' ? undefined : 'sr-only'
        }
      >
        {t('contextTags.label')}
      </legend>
      {selected.length && presentation !== 'composer' ? (
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
          {presentation === 'composer' ? (
            <EimirIcon name="hinzufuegen" />
          ) : null}
          <input
            ref={inputRef}
            id={id}
            value={draft}
            placeholder={t(
              presentation === 'composer'
                ? 'composer.addOwnTag'
                : 'contextTags.placeholder',
            )}
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
          {presentation !== 'composer' || draft.trim() ? (
            <AddActionButton
              ref={addRef}
              label={t('contextTags.add')}
              icon="tag"
              onClick={() => commit()}
            />
          ) : null}
        </div>
        {error ? (
          <p className="field-error" id={`${id}-error`} role="alert">
            {error}
          </p>
        ) : null}
        <details
          className="context-tag-suggestions"
          open={presentation === 'composer' ? true : undefined}
        >
          <summary>{t('contextTags.suggestions')}</summary>
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
          {presentation === 'composer' ? (
            <p className="field-help composer-tag-list-label">
              {t('composer.yourTags')}
            </p>
          ) : null}
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
        </details>
      </div>
    </fieldset>
  );
  if (presentation !== 'composer') return editor;
  return (
    <>
      {selected.map((tag) => (
        <input key={tag} type="hidden" name="tags" value={tag} />
      ))}
      {selected.length ? (
        <div className="composer-chips context-tag-selected">
          {selected.map((tag) => (
            <ComposerChip
              key={tag}
              icon="tag"
              disabled={disabled}
              aria-label={t('composer.editTag', { name: labelForTag(tag) })}
              onClick={() => setOpen(true)}
            >
              {labelForTag(tag)}
            </ComposerChip>
          ))}
        </div>
      ) : null}
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <ComposerTool
          icon="tag"
          label={t('composer.tag')}
          active={selected.length > 0}
          disabled={disabled}
          onClick={() => setOpen(true)}
        />
      )}
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={t('composer.tagsTitle')}
        onClose={() => setOpen(false)}
        className="composer-tag-sheet"
        isCloseBlocked={disabled}
        footer={
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (commit(true) !== null) sheet.current?.requestClose();
            }}
          >
            {t('experiences.finish')}
          </button>
        }
      >
        <p className="field-help">{t('composer.tagsHint')}</p>
        {editor}
      </ShortTaskSheet>
    </>
  );
}
