import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import { Configuration } from '../client/apiConfiguration';
import {
  GAMES_HEART_HUNT_ROUTE,
  GAMES_MOMENTS_ROUTE,
  GAMES_PICTURE_PING_PONG_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
  proPaywallPath,
} from '../client/routes';
import {
  entitlementLoader,
  useSpaceEntitlement,
} from '../client/spaceEntitlement';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import type { WhoOfUsParticipant } from '../client/whoOfUsSession';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { WhoOfUsGamePanel } from './WhoOfUsGamePanel';

export const GAMES_COUPLE_CAPABILITY = 'games.couple' as const;

const GAME_ENTRIES = [
  'moments',
  'wishes',
  'perspective',
  'heartHunt',
  'pingPong',
] as const;

type GameEntry = (typeof GAME_ENTRIES)[number];

function gameRoute(entry: GameEntry): string | null {
  if (entry === 'moments') return GAMES_MOMENTS_ROUTE;
  if (entry === 'wishes') return GAMES_WISH_DETECTIVE_ROUTE;
  if (entry === 'heartHunt') return GAMES_HEART_HUNT_ROUTE;
  if (entry === 'pingPong') return GAMES_PICTURE_PING_PONG_ROUTE;
  return null;
}

export function GamesProductArea({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  loadEntitlement,
  loadPerspectiveParticipants,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
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

  const load = useMemo(
    () =>
      loadEntitlement
        ? () => loadEntitlement()
        : entitlementLoader(entitlementApi, spaceId),
    [entitlementApi, loadEntitlement, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const entitlementQuery = useSpaceEntitlement({ accountId, spaceId, load });

  const gamesUnlocked = Boolean(
    entitlementQuery.data?.capabilities.includes(GAMES_COUPLE_CAPABILITY),
  );

  // The local game replaces the overview in place; system Back ends it like
  // its own back control instead of leaving Games.
  const exitLocalGame = useEditorHistoryEntry({
    isActive: gamesUnlocked && activeLocalGame === 'perspective',
    isDirty: false,
    onClose: () => setActiveLocalGame(null),
    onDiscardRequested: () => setActiveLocalGame(null),
  });

  if (gamesUnlocked && activeLocalGame === 'perspective') {
    return (
      <div className="page games-product-page">
        <WhoOfUsGamePanel
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          spaceId={spaceId}
          onExit={() => exitLocalGame()}
          loadParticipants={loadPerspectiveParticipants}
        />
      </div>
    );
  }

  return (
    <div className="page games-product-page">
      <PageHeader
        title={t('games.title')}
        description={t('games.intro')}
        className="games-heading"
      />

      {entitlementQuery.data && !gamesUnlocked ? (
        <p className="games-pro-hint">
          <Link
            className="button-link secondary-link"
            to={proPaywallPath('games')}
          >
            {t('proPaywall.contextAction')}
          </Link>
        </p>
      ) : null}
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
                  <EimirIcon
                    name={
                      (
                        [
                          'foto',
                          'wuensche',
                          'gemeinsam',
                          'momente',
                          'spiele',
                        ] satisfies EimirIconName[]
                      )[index]
                    }
                  />
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
                  onClick={() => {
                    if (entry === 'perspective') setActiveLocalGame(entry);
                  }}
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
