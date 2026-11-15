import { useState } from 'react';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { TaskBackButton } from './TaskBackButton';

const CARDS = [
  { id: 'invented', minutes: 3 },
  { id: 'wrongNumber', minutes: 2 },
  { id: 'missing', minutes: 4 },
  { id: 'doodle', minutes: 5 },
  { id: 'story', minutes: 3 },
  { id: 'mime', minutes: 3 },
  { id: 'lastStone', minutes: 3 },
  { id: 'blindTaste', minutes: 5 },
] as const;

function focusCardHeading(heading: HTMLHeadingElement | null): void {
  heading?.focus();
}

export function PaarMinutesGamePanel({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const card = CARDS[index];

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
        <p className="games-entry-status" id="paar-minutes-card-progress">
          {t('games.paarMinutes.progress', {
            current: index + 1,
            total: CARDS.length,
            minutes: card.minutes,
          })}
        </p>
        <h2
          key={card.id}
          id="paar-minutes-card"
          ref={focusCardHeading}
          tabIndex={-1}
          aria-describedby="paar-minutes-card-progress"
        >
          {t(`games.paarMinutes.cards.${card.id}.title`)}
        </h2>
        <p className="paar-minutes-materials">
          {t('games.paarMinutes.materials', {
            items: t(`games.paarMinutes.cards.${card.id}.items`),
          })}
        </p>
        <p>{t(`games.paarMinutes.cards.${card.id}.rules`)}</p>
      </section>
      <button
        className="primary"
        type="button"
        onClick={() => setIndex((current) => (current + 1) % CARDS.length)}
      >
        {t(
          index < CARDS.length - 1
            ? 'games.paarMinutes.next'
            : 'games.paarMinutes.restart',
        )}
      </button>
    </div>
  );
}
