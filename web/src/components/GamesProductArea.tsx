import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import { Configuration } from '../api/generated/runtime';
import { normalizeClientError } from '../client/problemDetails';
import {
  GAMES_MOMENTS_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
} from '../client/routes';
import type { WhoOfUsParticipant } from '../client/whoOfUsSession';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { WhoOfUsGamePanel } from './WhoOfUsGamePanel';

export const GAMES_COUPLE_CAPABILITY = 'games.couple' as const;

const GAME_ENTRIES = [
  'moments',
  'wishes',
  'perspective',
  'happiness',
  'timeTravel',
] as const;

type GameEntry = (typeof GAME_ENTRIES)[number];

function gameRoute(entry: GameEntry): string | null {
  if (entry === 'moments') return GAMES_MOMENTS_ROUTE;
  if (entry === 'wishes') return GAMES_WISH_DETECTIVE_ROUTE;
  return null;
}

export function GamesProductArea({
  apiBaseUrl,
  accessToken,
  spaceId,
  loadEntitlement,
  loadPerspectiveParticipants,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  loadEntitlement?: () => Promise<SpaceEntitlementView>;
  loadPerspectiveParticipants?: () => Promise<
    readonly [WhoOfUsParticipant, WhoOfUsParticipant] | null
  >;
}) {
  const { t } = useTranslation();
  const [activeLocalGame, setActiveLocalGame] = useState<'perspective' | null>(
    null,
  );
  const entitlementApi = useMemo(
    () =>
      new EntitlementsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );

  const entitlementQuery = useQuery({
    queryKey: ['games-entitlement', spaceId],
    queryFn: async () => {
      try {
        if (loadEntitlement) return await loadEntitlement();
        return await entitlementApi.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
          {
            spaceId,
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const gamesUnlocked = Boolean(
    entitlementQuery.data?.capabilities.includes(GAMES_COUPLE_CAPABILITY),
  );

  if (gamesUnlocked && activeLocalGame === 'perspective') {
    return (
      <div className="page games-product-page">
        <WhoOfUsGamePanel
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          spaceId={spaceId}
          onExit={() => setActiveLocalGame(null)}
          loadParticipants={loadPerspectiveParticipants}
        />
      </div>
    );
  }

  return (
    <div className="page games-product-page">
      <PageHeader
        eyebrow={t('games.eyebrow')}
        title={t('games.title')}
        description={t('games.intro')}
        className="games-heading"
      />

      {entitlementQuery.isPending ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : entitlementQuery.error ? (
        <ProblemState
          error={entitlementQuery.error}
          onRetry={() => void entitlementQuery.refetch()}
        />
      ) : (
        <section className="games-shelf" aria-label={t('games.title')}>
          {GAME_ENTRIES.map((entry, index) => {
            const route = gamesUnlocked ? gameRoute(entry) : null;
            const localGameAvailable = gamesUnlocked && entry === 'perspective';
            const playable = Boolean(route || localGameAvailable);
            const content = (
              <>
                <div className="games-entry-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="games-entry-copy">
                  <p className="games-entry-role">
                    {t(`games.entries.${entry}.role`)}
                  </p>
                  <h2>{t(`games.entries.${entry}.title`)}</h2>
                  <p>{t(`games.entries.${entry}.description`)}</p>
                </div>
                <span className="games-entry-status">
                  {playable
                    ? t('games.status.playNow')
                    : gamesUnlocked
                      ? t('games.status.comingSoon')
                      : t('games.status.premium')}
                </span>
              </>
            );

            if (route) {
              return (
                <Link
                  className="games-entry games-entry-link"
                  key={entry}
                  to={route}
                >
                  {content}
                </Link>
              );
            }

            if (localGameAvailable) {
              return (
                <button
                  type="button"
                  className="games-entry games-entry-link games-entry-button"
                  key={entry}
                  onClick={() => setActiveLocalGame('perspective')}
                >
                  {content}
                </button>
              );
            }

            return (
              <article className="games-entry" key={entry}>
                {content}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
