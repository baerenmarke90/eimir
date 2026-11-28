/**
 * "Eure Besucher" in the garden book (#1907 H3 follow-up): the visitors the
 * couple has met, each with a small portrait and the name both partners gave
 * it. Visitors that have not come by yet stay a secret, like undiscovered
 * plants. There is no counter and nothing to complete.
 */

import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
  ANIMALS,
  cleanVisitorName,
  type GardenAnimal,
  VISITOR_NAME_MAX,
  VISITOR_SUGGESTIONS,
} from '../client/gardenGrowth';
import { useTranslation } from '../i18n';
import { AnimalArt, PORTRAIT_BOX } from './GardenLife';

export function VisitorPortrait({ kind }: { kind: GardenAnimal }) {
  return (
    <span className="garden-visitor-portrait" aria-hidden="true">
      <svg viewBox={PORTRAIT_BOX[kind]} focusable="false" aria-hidden="true">
        <AnimalArt kind={kind} pose="rest" />
      </svg>
    </span>
  );
}

function VisitorEditor({
  kind,
  name,
  draft: kept,
  busy,
  onCancel,
  onSave,
}: {
  kind: GardenAnimal;
  name: string | null;
  /** A draft that could not be saved; it is offered again. */
  draft: string | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState(kept ?? name ?? '');
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const suggestions = VISITOR_SUGGESTIONS[kind].map((key) =>
    t(`games.garden.growth.visitors.suggestions.${kind}.${key}`),
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = cleanVisitorName(draft).slice(0, VISITOR_NAME_MAX);
    // An empty field removes a name; without one there is nothing to save.
    if (!cleaned && !name) {
      input.current?.focus();
      return;
    }
    onSave(cleaned);
  };
  return (
    <form
      className="garden-rename garden-visitor-editor"
      onSubmit={submit}
      data-testid={`garden-visitor-editor-${kind}`}
    >
      <label htmlFor={inputId}>
        {t(`games.garden.growth.visitors.question.${kind}`)}
      </label>
      <input
        ref={input}
        id={inputId}
        value={draft}
        maxLength={VISITOR_NAME_MAX}
        autoComplete="off"
        enterKeyHint="done"
        placeholder={t('games.garden.growth.visitors.placeholder', {
          name: suggestions[0],
        })}
        aria-describedby={name ? hintId : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <fieldset className="garden-visitor-suggestions">
        <legend className="sr-only">
          {t('games.garden.growth.visitors.suggestionsLabel')}
        </legend>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="garden-word"
            aria-pressed={draft === suggestion}
            onClick={() => {
              setDraft(suggestion);
              input.current?.focus();
            }}
          >
            {suggestion}
          </button>
        ))}
      </fieldset>
      <div className="garden-visitor-editor-row">
        {name ? (
          <p id={hintId} className="garden-hint">
            {t('games.garden.growth.visitors.hint')}
          </p>
        ) : null}
        <span className="garden-visitor-counter" aria-hidden="true">
          {t('games.garden.growth.visitors.counter', {
            count: draft.length,
            max: VISITOR_NAME_MAX,
          })}
        </span>
      </div>
      <div className="garden-card-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={busy}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

export function GardenVisitors({
  met,
  names,
  editing,
  busy,
  failed,
  onEdit,
  onName,
  onCall,
}: {
  /** Visitors the couple has already met; the others stay a secret. */
  met: ReadonlyArray<GardenAnimal>;
  names: Partial<Record<GardenAnimal, string>>;
  /** The visitor whose name is being edited, if any. */
  editing: GardenAnimal | null;
  busy: boolean;
  /** The last save that failed; its editor reopens with the draft. */
  failed: { kind: GardenAnimal; draft: string } | null;
  onEdit: (kind: GardenAnimal | null) => void;
  onName: (kind: GardenAnimal, name: string) => void;
  /** "Rufen": a named visitor comes to greet; the book closes. */
  onCall?: (kind: GardenAnimal) => void;
}) {
  const { t } = useTranslation();
  const actions = useRef(new Map<GardenAnimal, HTMLButtonElement>());
  const returnTo = useRef<GardenAnimal | null>(null);
  // Focus returns to the row's action after the editor closes.
  useEffect(() => {
    if (editing !== null || returnTo.current === null) return;
    actions.current.get(returnTo.current)?.focus({ preventScroll: true });
    returnTo.current = null;
  }, [editing]);
  const close = (kind: GardenAnimal) => {
    returnTo.current = kind;
    onEdit(null);
  };
  return (
    <section
      className="garden-visitors"
      aria-labelledby="garden-visitors-title"
      data-testid="garden-visitors"
    >
      <h3 id="garden-visitors-title">
        {t('games.garden.growth.visitors.title')}
      </h3>
      <ul className="garden-visitor-list">
        {ANIMALS.map((kind) => {
          if (!met.includes(kind)) {
            return (
              <li key={kind} className="garden-visitor is-unknown">
                <span className="garden-visitor-row">
                  <span
                    className="garden-visitor-portrait garden-herbarium-unknown"
                    aria-hidden="true"
                  >
                    ?
                  </span>
                  <span className="garden-visitor-text">
                    <span className="garden-visitor-sub">
                      {t('games.garden.growth.visitors.unknown')}
                    </span>
                  </span>
                </span>
              </li>
            );
          }
          const name = names[kind] ?? null;
          const open = editing === kind;
          return (
            <li
              key={kind}
              className="garden-visitor"
              data-testid={`garden-visitor-${kind}`}
            >
              <span className="garden-visitor-row">
                <VisitorPortrait kind={kind} />
                <span className="garden-visitor-text">
                  <span
                    key={name ?? ''}
                    className={`garden-visitor-name${name ? ' is-named' : ''}`}
                  >
                    {name ?? t(`games.garden.growth.visitors.own.${kind}`)}
                  </span>
                  <span className="garden-visitor-sub">
                    {name
                      ? t('games.garden.growth.visitors.namedSub', {
                          animal: t(`games.garden.growth.animals.${kind}`),
                          where: t(
                            `games.garden.growth.visitors.where.${kind}`,
                          ),
                        })
                      : t('games.garden.growth.visitors.unnamed')}
                  </span>
                </span>
                {open ? null : (
                  <span className="garden-visitor-actions">
                    {name && onCall ? (
                      <button
                        type="button"
                        className="tertiary garden-visitor-action"
                        aria-label={t('games.garden.ambience.call.label', {
                          name,
                        })}
                        data-testid={`garden-visitor-call-${kind}`}
                        onClick={() => onCall(kind)}
                      >
                        {t('games.garden.ambience.call.action')}
                      </button>
                    ) : null}
                    <button
                      ref={(element) => {
                        if (element) actions.current.set(kind, element);
                        else actions.current.delete(kind);
                      }}
                      type="button"
                      className="tertiary garden-visitor-action"
                      aria-label={`${
                        name
                          ? t('games.garden.growth.visitors.rename')
                          : t('games.garden.growth.visitors.give')
                      }: ${name ?? t(`games.garden.growth.visitors.own.${kind}`)}`}
                      onClick={() => onEdit(kind)}
                    >
                      {name
                        ? t('games.garden.growth.visitors.rename')
                        : t('games.garden.growth.visitors.give')}
                    </button>
                  </span>
                )}
              </span>
              {open ? (
                <>
                  {failed?.kind === kind ? (
                    <p className="garden-visitor-error" role="alert">
                      {t('games.garden.growth.visitors.failed')}
                    </p>
                  ) : null}
                  <VisitorEditor
                    kind={kind}
                    name={name}
                    draft={failed?.kind === kind ? failed.draft : null}
                    busy={busy}
                    onCancel={() => close(kind)}
                    onSave={(next) => {
                      returnTo.current = kind;
                      onName(kind, next);
                    }}
                  />
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
