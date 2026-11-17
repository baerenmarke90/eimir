/**
 * The garden book, the quiet "new in the garden" card and the garden of the
 * year (#1907 H3, PR 3). Unlocks stay quiet: no counter, no progress bar and
 * no hint of how far away the rest is (Product Owner 2026-11-16, #866).
 */

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { GardenForm } from '../api/generated/models/GardenForm';
import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import { BOOK_SPECIES, FINDS, isFind } from '../client/gardenGrowth';
import { useTranslation } from '../i18n';
import { SeedIcon } from './GardenArt';

export const GARDEN_NAME_MAX = 40;

/** Announces what is new once, then it is simply part of the garden. */
export function GardenNewsCard({
  news,
  form,
  busy,
  onDone,
}: {
  news: ReadonlyArray<GardenUnlock>;
  form: GardenForm;
  busy: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="garden-card garden-news"
      aria-labelledby="garden-news-title"
      aria-live="polite"
      data-testid="garden-news"
    >
      <p className="garden-eyebrow">{t('games.garden.growth.newsEyebrow')}</p>
      <h2 id="garden-news-title">{t(`games.garden.growth.forms.${form}`)}</h2>
      <ul className="garden-finds">
        {news.map((unlock, index) => (
          <li
            key={unlock}
            className="garden-find garden-find-new"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            {isFind(unlock)
              ? t(
                  `games.garden.growth.finds.${unlock}` as 'games.garden.growth.finds.PATH',
                )
              : t('games.garden.growth.newSeeds', {
                  species: t(
                    `games.garden.species.${unlock as GardenSpecies}.name`,
                  ),
                })}
          </li>
        ))}
      </ul>
      <p>{t('games.garden.growth.newsBody')}</p>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={onDone}
      >
        {t('games.garden.growth.newsDone')}
      </button>
    </section>
  );
}

/** Discovered plants and finds, the garden's form and its editable name. */
export function GardenBook({
  name,
  form,
  discovered,
  unlocks,
  colour,
  busy,
  onRename,
  visitors,
}: {
  name: string | null;
  form: GardenForm;
  discovered: ReadonlyArray<GardenSpecies>;
  unlocks: ReadonlyArray<GardenUnlock>;
  colour: string;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  /** "Eure Besucher", the visitors the couple has met and named. */
  visitors?: ReactNode;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name ?? '');
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (renaming) input.current?.focus();
  }, [renaming]);
  const title = name ?? t('games.garden.title');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onRename(draft.trim().slice(0, GARDEN_NAME_MAX)))
      setRenaming(false);
  };
  return (
    <section
      className="garden-card garden-book"
      aria-labelledby="garden-book-title"
      data-testid="garden-book"
    >
      <p className="garden-eyebrow">{t('games.garden.growth.book')}</p>
      {renaming ? (
        <form
          className="garden-rename"
          onSubmit={(event) => void submit(event)}
        >
          <label htmlFor={inputId}>{t('games.garden.growth.nameLabel')}</label>
          <input
            ref={input}
            id={inputId}
            value={draft}
            maxLength={GARDEN_NAME_MAX}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(event) => setDraft(event.target.value)}
          />
          <p className="garden-hint">{t('games.garden.growth.nameHint')}</p>
          <div className="garden-card-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDraft(name ?? '');
                setRenaming(false);
              }}
            >
              {t('games.garden.cancel')}
            </button>
            <button type="submit" disabled={busy}>
              {t('games.garden.growth.save')}
            </button>
          </div>
        </form>
      ) : (
        <div className="garden-book-head">
          <h2 id="garden-book-title">{title}</h2>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDraft(name ?? '');
              setRenaming(true);
            }}
          >
            {t('games.garden.growth.rename')}
          </button>
        </div>
      )}
      <p>{t(`games.garden.growth.forms.${form}`)}</p>
      <h3>{t('games.garden.growth.bookPlants')}</h3>
      <ul className="garden-herbarium">
        {BOOK_SPECIES.map((species) => {
          const known = discovered.includes(species);
          return (
            <li key={species} className={known ? undefined : 'is-unknown'}>
              {known ? (
                <SeedIcon species={species} colour={colour} size={44} />
              ) : (
                <span className="garden-herbarium-unknown" aria-hidden="true">
                  ?
                </span>
              )}
              <span>
                {known
                  ? t(`games.garden.species.${species}.name`)
                  : t('games.garden.growth.undiscovered')}
              </span>
            </li>
          );
        })}
      </ul>
      {visitors}
      <h3>{t('games.garden.growth.bookFinds')}</h3>
      <ul className="garden-finds">
        {FINDS.map((find) => {
          const found = unlocks.includes(find);
          return (
            <li
              key={find}
              className={`garden-find${found ? '' : ' is-unknown'}`}
            >
              {found
                ? t(`games.garden.growth.finds.${find}`)
                : t('games.garden.growth.secret')}
            </li>
          );
        })}
      </ul>
      <p className="garden-hint">{t('games.garden.growth.bookFootnote')}</p>
    </section>
  );
}

/** In December the couple may keep the garden of the year as a picture. */
export function GardenYearCard({
  year,
  busy,
  saved,
  onSave,
}: {
  year: number;
  busy: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="garden-card"
      aria-labelledby="garden-year-title"
      data-testid="garden-year"
    >
      <h2 id="garden-year-title">
        {t('games.garden.growth.yearTitle', { year })}
      </h2>
      <p>{t('games.garden.growth.yearBody')}</p>
      <button
        type="button"
        className="secondary"
        disabled={busy || saved}
        onClick={onSave}
      >
        {saved
          ? t('games.garden.growth.yearSaved')
          : t('games.garden.growth.yearSave')}
      </button>
    </section>
  );
}
