import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { loadGameParticipants } from '../client/gameParticipants';
import { normalizeClientError } from '../client/problemDetails';
import type { WhoOfUsParticipant } from '../client/whoOfUsSession';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';

const PROMPTS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
] as const;
type Game = 'happiness' | 'timeTravel';

function Session({ game, onExit }: { game: Game; onExit: () => void }) {
  const { t } = useTranslation();
  const [round, setRound] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [offset, setOffset] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const finished = round === PROMPTS.length;
  useEffect(() => {
    if (round >= 0) heading.current?.focus();
  }, [round]);
  function next(done: boolean) {
    if (done) setCompleted((value) => value + 1);
    setRound((value) => Math.min(value + 1, PROMPTS.length));
  }
  return (
    <section className="who-of-us-card local-couple-session">
      <p className="eyebrow">
        {t(finished ? 'games.local.finished' : 'games.local.progress', {
          current: round + 1,
          total: PROMPTS.length,
        })}
      </p>
      <h2 ref={heading} tabIndex={-1}>
        {t(
          finished
            ? 'games.local.finishTitle'
            : `games.local.${game}.${PROMPTS[(round + offset) % PROMPTS.length]}`,
        )}
      </h2>
      <p>
        {t(
          finished
            ? 'games.local.finishBody'
            : `games.local.${game}.instruction`,
          { count: completed },
        )}
      </p>
      <div className="who-of-us-actions">
        {finished ? (
          <>
            <button
              type="button"
              onClick={() => {
                setCompleted(0);
                setOffset((value) => value + 1);
                setRound(0);
              }}
            >
              {t('games.local.restart')}
            </button>
            <button type="button" className="secondary" onClick={onExit}>
              {t('games.local.back')}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => next(true)}>
              {t(
                game === 'happiness' ? 'games.local.done' : 'games.local.next',
              )}
            </button>
            <button
              type="button"
              className="tertiary"
              onClick={() => next(false)}
            >
              {t('games.local.skip')}
            </button>
          </>
        )}
      </div>
      <p className="field-help">{t('games.local.privacy')}</p>
    </section>
  );
}

export function LocalCoupleGame({
  game,
  onExit,
  apiBaseUrl,
  accessToken,
  spaceId,
  loadParticipants,
}: {
  game: Game;
  onExit: () => void;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  loadParticipants?: () => Promise<
    readonly [WhoOfUsParticipant, WhoOfUsParticipant] | null
  >;
}) {
  const { t } = useTranslation();
  const participants = useQuery({
    queryKey: ['games', 'participants', spaceId],
    queryFn: async () => {
      try {
        return await (loadParticipants
          ? loadParticipants()
          : loadGameParticipants({ apiBaseUrl, accessToken, spaceId }));
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });
  return (
    <div className="page games-product-page">
      <PageHeader
        title={t(`games.entries.${game}.title`)}
        description={t(`games.entries.${game}.description`)}
        before={
          <button type="button" className="back-link tertiary" onClick={onExit}>
            {t('games.local.back')}
          </button>
        }
      />
      {participants.isPending ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : participants.error ? (
        <ProblemState
          error={participants.error}
          onRetry={() => void participants.refetch()}
        />
      ) : !participants.data ? (
        <UiState
          kind="empty"
          title={t('games.local.coupleRequiredTitle')}
          body={t('games.local.coupleRequiredBody')}
        />
      ) : (
        <Session game={game} onExit={onExit} />
      )}
    </div>
  );
}
