import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from '../i18n';
import {
  attachGestureFollow,
  type CommitSide,
  durationMs,
  type GestureFollow,
} from '../motion';

export interface DeckItem {
  key: string;
  title: string;
  lang?: string;
  media: ReactNode;
  favorite: boolean;
  setFavorite: (favorite: boolean) => void;
}

/** Extra travel past the card's own width before a decided card is gone. */
const LEAVE_GAP = 48;

/**
 * The favourite step as a card deck (#2371; Product Owner, 2026-11-28).
 *
 * One candidate at a time: swiping right, the favourite button or Arrow
 * Right makes it a private favourite; swiping left, the skip button or Arrow
 * Left leaves it out. The decision is recorded at release (M10); the card
 * then settles off screen on its own clock and the next one rises. The back
 * button brings back the previous card. After the last card `onDone` hands over to
 * the summary list, where every choice can still change before sending.
 *
 * The swipe is Gesture follow (Motion Contract 4.6) in its two-sided mode;
 * the buttons and keys run the same commit without a gesture.
 */
export function WishSelectionDeck({
  items,
  disabled,
  onDone,
}: {
  items: readonly DeckItem[];
  disabled: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const top = items[index];
  const topKey = useRef<string | undefined>(top?.key);
  topKey.current = top?.key;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const controllers = useRef(new Map<string, GestureFollow>());
  const binders = useRef(
    new Map<string, (element: HTMLElement | null) => void>(),
  );
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const decide = useCallback(
    (key: string, side: CommitSide) => {
      if (key !== topKey.current) return;
      const item = itemsRef.current.find((entry) => entry.key === key);
      if (!item) return;
      item.setFavorite(side === 1);
      setAnnouncement(
        t(
          side === 1 ? 'wishSelection.deckLiked' : 'wishSelection.deckSkipped',
          {
            title: item.title,
          },
        ),
      );
      setLeaving((current) =>
        current.includes(key) ? current : [...current, key],
      );
      setIndex((current) => current + 1);
    },
    [t],
  );

  const settled = useCallback((key: string) => {
    setLeaving((current) => current.filter((entry) => entry !== key));
  }, []);

  // One stable ref callback per card, so a re-render never re-attaches the
  // gesture (that would cancel a card that is still settling off screen).
  const bind = (key: string) => {
    let binder = binders.current.get(key);
    if (!binder) {
      binder = (element: HTMLElement | null) => {
        controllers.current.get(key)?.dispose();
        controllers.current.delete(key);
        if (!element) {
          cardRefs.current.delete(key);
          return;
        }
        cardRefs.current.set(key, element);
        controllers.current.set(
          key,
          attachGestureFollow(element, {
            axis: 'x',
            direction: 'both',
            size: () => element.offsetWidth,
            threshold: 'pager',
            range: () => ({ min: -Infinity, max: Infinity }),
            committedOffset: (side) => side * (element.offsetWidth + LEAVE_GAP),
            canStart: () => key === topKey.current && !disabledRef.current,
            onCommit: (side) => decide(key, side),
            onSettled: () => settled(key),
          }),
        );
      };
      binders.current.set(key, binder);
    }
    return binder;
  };

  const commit = (side: CommitSide) => {
    if (!top || disabled) return;
    const controller = controllers.current.get(top.key);
    if (controller) controller.commit(side);
    else {
      decide(top.key, side);
      settled(top.key);
    }
  };

  const back = () => {
    if (index === 0 || disabled) return;
    const previous = items[index - 1];
    // A card that is still leaving comes back from where it is.
    controllers.current.get(previous.key)?.cancel();
    settled(previous.key);
    setAnnouncement('');
    setIndex(index - 1);
  };

  // After the last decision the list takes over once the card has left the
  // stage (`--duration-transition`), without waiting for the spring's quiet
  // tail off screen.
  const finished = index >= items.length;
  const flying = leaving.length > 0;
  useEffect(() => {
    if (!finished) return;
    if (!flying) {
      onDone();
      return;
    }
    const handOver = setTimeout(onDone, durationMs('transition'));
    return () => clearTimeout(handOver);
  }, [finished, flying, onDone]);

  // The deck's own focus follows the top card, so keyboard use continues.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus moves when the top card changes.
  useEffect(() => {
    if (!top) return;
    const card = cardRefs.current.get(top.key);
    // Only when focus is already in the deck (a key or a button decided).
    if (card?.ownerDocument.activeElement?.closest('.wish-selection-deck'))
      card.focus({ preventScroll: true });
  }, [top?.key]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      commit(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commit(-1);
    }
  };

  const next = items[index + 1];
  const shown = items.filter(
    (item) =>
      item.key === top?.key ||
      item.key === next?.key ||
      leaving.includes(item.key),
  );

  return (
    <div className="wish-selection-deck">
      <p className="wish-selection-support">{t('wishSelection.deckHint')}</p>
      <div className="wish-selection-deck-stage">
        {/* Later cards first, so the top card and leaving cards paint above. */}
        {[...shown].reverse().map((item) => {
          const place = leaving.includes(item.key)
            ? 'leaving'
            : item.key === top?.key
              ? 'top'
              : 'next';
          const position = items.indexOf(item) + 1;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a swipeable card, not a fieldset
            <div
              key={item.key}
              ref={bind(item.key)}
              className="wish-selection-deck-card"
              data-place={place}
              role="group"
              aria-roledescription={t('wishSelection.deckCard')}
              aria-label={`${item.title}, ${t('wishSelection.deckProgress', {
                current: position,
                total: items.length,
              })}`}
              aria-hidden={place === 'top' ? undefined : true}
              tabIndex={place === 'top' ? 0 : -1}
              onKeyDown={place === 'top' ? onKeyDown : undefined}
            >
              <span className="wish-selection-deck-media">{item.media}</span>
              <span className="wish-selection-deck-title" lang={item.lang}>
                {item.title}
              </span>
            </div>
          );
        })}
      </div>
      <p className="wish-selection-deck-progress" aria-hidden="true">
        {top
          ? t('wishSelection.deckProgress', {
              current: index + 1,
              total: items.length,
            })
          : null}
      </p>
      <div className="wish-selection-deck-actions">
        <button
          type="button"
          className="secondary"
          disabled={!top || disabled}
          onClick={() => commit(-1)}
        >
          {t('wishSelection.deckSkip')}
        </button>
        <button
          type="button"
          disabled={!top || disabled}
          onClick={() => commit(1)}
        >
          <DeckHeart />
          {t('wishSelection.deckLike')}
        </button>
      </div>
      {index > 0 ? (
        <button
          type="button"
          className="button-link secondary-link wish-selection-deck-back"
          disabled={disabled}
          onClick={back}
        >
          {t('wishSelection.deckBack')}
        </button>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function DeckHeart() {
  return (
    <svg
      className="wish-selection-deck-heart inline-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  );
}
