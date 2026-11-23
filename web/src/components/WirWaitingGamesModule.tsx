import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo } from 'react';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { GamesApi } from '../api/generated/apis/GamesApi';
import type { WaitingGameView } from '../api/generated/models/WaitingGameView';
import type { WaitingGameKind } from '../api/generated/models/WaitingGameKind';
import { dashboardQueryKey } from '../client/dashboardQueries';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import {
  GAMES_GARDEN_ROUTE,
  GAMES_HEART_HUNT_ROUTE,
  GAMES_MOMENTS_ROUTE,
  GAMES_PICTURE_PING_PONG_ROUTE,
  GAMES_WHO_OF_US_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
} from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
  withdrawSpaceCapability,
} from '../client/spaceEntitlement';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { GAMES_COUPLE_CAPABILITY } from './GamesProductArea';
import { TodayDestinationLink } from './TodayDestinationLink';
import './WirWaitingGamesModule.css';

/**
 * Lives under the Dashboard key so every Wir refresh, and every game notice
 * that refreshes Wir, also refreshes what waits (#2158 C).
 */
export function waitingGamesQueryKey(accountId: string, spaceId: string) {
  return [...dashboardQueryKey(spaceId), 'waiting-games', accountId] as const;
}

/** Each game opens its own page; its title reuses the Games overview entry. */
const GAME_PRESENTATION: Record<
  WaitingGameKind,
  { route: string; icon: EimirIconName; entry: string }
> = {
  WHO_OF_US: {
    route: GAMES_WHO_OF_US_ROUTE,
    icon: 'gemeinsam',
    entry: 'perspective',
  },
  WISH_DETECTIVE: {
    route: GAMES_WISH_DETECTIVE_ROUTE,
    icon: 'wuensche',
    entry: 'wishes',
  },
  OUR_MOMENTS: { route: GAMES_MOMENTS_ROUTE, icon: 'foto', entry: 'moments' },
  PICTURE_PING_PONG: {
    route: GAMES_PICTURE_PING_PONG_ROUTE,
    icon: 'pen',
    entry: 'pingPong',
  },
  HEART_HUNT: {
    route: GAMES_HEART_HUNT_ROUTE,
    icon: 'momente',
    entry: 'heartHunt',
  },
  GARDEN_SEED: { route: GAMES_GARDEN_ROUTE, icon: 'spiele', entry: 'garden' },
  GARDEN_BOUQUET: {
    route: GAMES_GARDEN_ROUTE,
    icon: 'geschenk',
    entry: 'garden',
  },
};

function isEntitlementRequired(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.kind === 'permission' &&
    error.code === 'PREMIUM_ENTITLEMENT_REQUIRED'
  );
}

/**
 * Games that wait on the reader, one calm row each with a single way in
 * (#2158 C). On by default but it renders nothing while nothing waits, while
 * it loads or fails, and without `games.couple` (then it reads nothing).
 * The rows name the game and what it asks, never its content.
 */
export function WirWaitingGamesModule({
  gamesApi,
  entitlementApi,
  accountId,
  spaceId,
  partnerName,
  visible,
}: {
  gamesApi: Pick<GamesApi, 'getWaitingGames'>;
  entitlementApi: EntitlementsApi;
  accountId: string;
  spaceId: string;
  partnerName: string;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const headingId = useId();
  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlementApi, spaceId),
    [entitlementApi, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const games = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    enabled: visible,
    capability: GAMES_COUPLE_CAPABILITY,
  });
  const allowed = visible && games.data === true && !games.isError;
  const waitingQuery = useQuery({
    queryKey: waitingGamesQueryKey(accountId, spaceId),
    queryFn: async ({ signal }) => {
      try {
        return await gamesApi.getWaitingGames({ spaceId }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: allowed,
    retry: false,
  });
  const denied = isEntitlementRequired(waitingQuery.error);
  useEffect(() => {
    if (!denied) return;
    withdrawSpaceCapability(
      queryClient,
      accountId,
      spaceId,
      GAMES_COUPLE_CAPABILITY,
    );
  }, [accountId, denied, queryClient, spaceId]);

  const items = waitingQuery.data?.items ?? [];
  if (!allowed || items.length === 0) return null;
  return (
    <section
      className="today-section today-section-waiting-games"
      aria-labelledby={headingId}
    >
      <div className="today-section-header">
        <h2 id={headingId} className="today-section-title">
          {t('games.waiting.title')}
        </h2>
      </div>
      <ul className="wir-waiting-games">
        {items.map((item: WaitingGameView) => {
          const game = GAME_PRESENTATION[item.game];
          return (
            <li key={item.game}>
              <TodayDestinationLink
                to={game.route}
                className="today-agenda-row today-agenda-row-link wir-waiting-game"
                selectedKey={`wir-waiting-${item.game}`}
              >
                <span className="today-agenda-icon" aria-hidden="true">
                  <EimirIcon name={game.icon} />
                </span>
                <span className="today-agenda-copy">
                  <span className="today-agenda-title">
                    {t(`games.entries.${game.entry}.title`)}
                  </span>
                  <span className="wir-waiting-game-reason">
                    {t(`games.waiting.reasons.${item.game}`, {
                      name: partnerName,
                    })}
                  </span>
                </span>
                <EimirIcon name="chevron-right" />
              </TodayDestinationLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
