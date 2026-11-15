import { useState } from 'react';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { TaskBackButton } from './TaskBackButton';

const FORMATS = [
  { id: 'film', minutes: 2 },
  { id: 'story', minutes: 4 },
  { id: 'match', minutes: 2 },
  { id: 'choice', minutes: 3 },
] as const;

const ROUND_GROUPS = [
  {
    film: 'homeAlone',
    story: 'wrongPlace',
    match: 'hotelNight',
    choice: 'concert',
  },
  {
    film: 'ratatouille',
    story: 'dinnerSave',
    match: 'summer',
    choice: 'hotelRoom',
  },
  {
    film: 'findingNemo',
    story: 'oddPurchase',
    match: 'sundaySound',
    choice: 'bistro',
  },
  {
    film: 'groundhogDay',
    story: 'surpriseInvite',
    match: 'trainSnack',
    choice: 'sleepIn',
  },
  {
    film: 'jurassicPark',
    story: 'familyHabit',
    match: 'sleptThrough',
    choice: 'museum',
  },
  {
    film: 'backToTheFuture',
    story: 'misheardSong',
    match: 'strangeKitchen',
    choice: 'cinema',
  },
] as const;

const ROUND_COUNT = FORMATS.length * ROUND_GROUPS.length;

function focusHeading(heading: HTMLHeadingElement | null): void {
  heading?.focus();
}

export function PaarMinutesGamePanel({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(
    () => Math.floor(Math.random() * ROUND_GROUPS.length) * FORMATS.length,
  );
  const [revealed, setRevealed] = useState(false);
  const group = ROUND_GROUPS[Math.floor(index / FORMATS.length)];
  const format = FORMATS[index % FORMATS.length];
  const roundId = group[format.id];
  const roundKey = `games.paarMinutes.rounds.${roundId}`;
  const filmRound = format.id === 'film';
  const canReveal = filmRound && !revealed;

  function nextRound() {
    setRevealed(false);
    setIndex((current) => (current + 1) % ROUND_COUNT);
  }

  return (
    <div className="paar-minutes-game">
      <PageHeader
        before={
          <TaskBackButton onClick={onExit}>
            {t('games.paarMinutes.back')}
          </TaskBackButton>
        }
        title={t('games.entries.paarMinutes.title')}
      />
      <section
        className="paar-minutes-card"
        aria-labelledby="paar-minutes-card"
      >
        <p className="games-entry-status" id="paar-minutes-card-duration">
          {t('games.paarMinutes.duration', {
            minutes: format.minutes,
          })}
        </p>
        <h2
          key={roundId}
          id="paar-minutes-card"
          ref={focusHeading}
          tabIndex={-1}
          aria-describedby="paar-minutes-card-duration"
        >
          {t(`games.paarMinutes.formats.${format.id}.title`)}
        </h2>
        <p className="paar-minutes-instructions">
          {t(`games.paarMinutes.formats.${format.id}.rules`)}
        </p>
        <p className="paar-minutes-prompt">{t(`${roundKey}.prompt`)}</p>
        {filmRound && revealed ? (
          <div className="paar-minutes-answer">
            <p id="paar-minutes-answer-label">
              {t('games.paarMinutes.answer')}
            </p>
            <h3
              ref={focusHeading}
              tabIndex={-1}
              aria-describedby="paar-minutes-answer-label"
            >
              {t(`${roundKey}.answer`)}
            </h3>
          </div>
        ) : null}
      </section>
      <div className="paar-minutes-actions">
        {canReveal ? (
          <button
            className="primary"
            type="button"
            onClick={() => setRevealed(true)}
          >
            {t('games.paarMinutes.reveal')}
          </button>
        ) : null}
        <button
          className={canReveal ? 'tertiary' : 'primary'}
          type="button"
          onClick={nextRound}
        >
          {t('games.paarMinutes.next')}
        </button>
      </div>
    </div>
  );
}
