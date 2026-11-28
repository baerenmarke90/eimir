import { type ReactNode, useCallback, useState } from 'react';
import type { DateIdea } from '../api/generated/models/DateIdea';
import type { WishSelectionCandidateView } from '../api/generated/models/WishSelectionCandidateView';
import { useTranslation } from '../i18n';
import { type DeckItem, WishSelectionDeck } from './WishSelectionDeck';

export type ResultItem =
  | { kind: 'wish'; key: string; candidate: WishSelectionCandidateView }
  | { kind: 'idea'; key: string; idea: DateIdea };

export function WishSelectionVote({
  available,
  availableIdeas,
  favoriteIds,
  favoriteIdeaIds,
  busy,
  canPublish,
  onPublish,
  onToggleWish,
  onToggleIdea,
  candidateMedia,
  ideasLang,
  startWithDeck,
}: {
  available: readonly WishSelectionCandidateView[];
  availableIdeas: readonly DateIdea[];
  favoriteIds: readonly string[];
  favoriteIdeaIds: readonly string[];
  busy: boolean;
  canPublish: boolean;
  onPublish: () => void;
  onToggleWish: (id: string) => void;
  onToggleIdea: (id: string) => void;
  candidateMedia: (item: ResultItem) => ReactNode;
  ideasLang: (idea: DateIdea) => string | undefined;
  /** #2371: no favourite saved yet, so the step opens as a card deck. */
  startWithDeck: boolean;
}) {
  const { t } = useTranslation();
  const favoriteTotal = favoriteIds.length + favoriteIdeaIds.length;
  const candidateTotal = available.length + availableIdeas.length;
  // #2371: a first choice starts as a card deck; saved favourites (an edit
  // after sending) open the list directly.
  const [deck, setDeck] = useState(startWithDeck);
  const closeDeck = useCallback(() => setDeck(false), []);
  if (deck && candidateTotal > 0) {
    const deckItems: DeckItem[] = [
      ...available.map((candidate) => {
        const favorite = favoriteIds.includes(candidate.wishId);
        return {
          key: `wish:${candidate.wishId}`,
          title: candidate.title,
          media: candidateMedia({
            kind: 'wish',
            key: candidate.wishId,
            candidate,
          }),
          favorite,
          setFavorite: (on: boolean) => {
            if (on !== favorite) onToggleWish(candidate.wishId);
          },
        };
      }),
      ...availableIdeas.map((idea) => {
        const favorite = favoriteIdeaIds.includes(idea.id);
        return {
          key: `idea:${idea.id}`,
          title: idea.title,
          lang: ideasLang(idea),
          media: candidateMedia({ kind: 'idea', key: idea.id, idea }),
          favorite,
          setFavorite: (on: boolean) => {
            if (on !== favorite) onToggleIdea(idea.id);
          },
        };
      }),
    ];
    return (
      <WishSelectionDeck items={deckItems} disabled={busy} onDone={closeDeck} />
    );
  }
  return (
    <form
      className="wish-selection-form"
      onSubmit={(event) => {
        event.preventDefault();
        onPublish();
      }}
    >
      <fieldset disabled={busy} className="wish-selection-fields">
        <legend className="sr-only">{t('wishSelection.favorites')}</legend>
        <ul className="wish-selection-favorites">
          {available.map((candidate) => {
            const on = favoriteIds.includes(candidate.wishId);
            return (
              <li key={candidate.wishId}>
                <button
                  type="button"
                  className="wish-selection-favorite"
                  aria-pressed={on}
                  onClick={() => onToggleWish(candidate.wishId)}
                >
                  {candidateMedia({
                    kind: 'wish',
                    key: candidate.wishId,
                    candidate,
                  })}
                  <span className="wish-selection-favorite-title">
                    {candidate.title}
                  </span>
                  <FavoriteHeart />
                </button>
              </li>
            );
          })}
          {availableIdeas.map((idea) => {
            const on = favoriteIdeaIds.includes(idea.id);
            return (
              <li key={idea.id}>
                <button
                  type="button"
                  className="wish-selection-favorite is-idea"
                  aria-pressed={on}
                  onClick={() => onToggleIdea(idea.id)}
                >
                  {candidateMedia({ kind: 'idea', key: idea.id, idea })}
                  <span
                    className="wish-selection-favorite-title"
                    lang={ideasLang(idea)}
                  >
                    {idea.title}
                  </span>
                  <FavoriteHeart />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="wish-selection-support" role="status">
          {favoriteTotal
            ? t('wishSelection.favoriteCount', { count: favoriteTotal })
            : t('wishSelection.favoriteNone')}
          {favoriteTotal === candidateTotal && candidateTotal > 2
            ? ` · ${t('wishSelection.allFavorites')}`
            : null}
        </p>
        <div className="wish-selection-actions">
          <button type="submit" disabled={busy || !canPublish}>
            {t(
              busy
                ? 'common.saving'
                : favoriteTotal
                  ? 'wishSelection.share'
                  : 'wishSelection.shareNone',
            )}
          </button>
          <p className="wish-selection-support">
            {t('wishSelection.changeLater')}
          </p>
        </div>
      </fieldset>
    </form>
  );
}

/** Outline heart that fills while the candidate is a private favourite. */
function FavoriteHeart() {
  return (
    <svg
      className="wish-selection-favorite-heart inline-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  );
}
