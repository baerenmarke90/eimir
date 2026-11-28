import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo } from 'react';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { GamesApi } from '../api/generated/apis/GamesApi';
import type { WaitingGameKind } from '../api/generated/models/WaitingGameKind';
import type { WaitingGameView } from '../api/generated/models/WaitingGameView';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { usePrimaryTabReturn } from '../client/primaryTabActive';
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
import { cardArrivalClass, useCardArrivals } from '../client/useCardArrivals';
import { useTranslation } from '../i18n';
import { GAMES_COUPLE_CAPABILITY } from './GamesProductArea';
import { TodayDestinationLink } from './TodayDestinationLink';
import { WirGameTileArt } from './WirGameTileArt';
import './WirCardArrival.css';
import './WirLists.css';
import './WirWaitingGamesModule.css';

/**
 * Lives under the Dashboard key so every Wir refresh, and every game notice
 * that refreshes Wir, also refreshes what waits (#2158 C).
 */
export function waitingGamesQueryKey(accountId: string, spaceId: string) {
  return [...dashboardQueryKey(spaceId), 'waiting-games', accountId] as const;
}

/**
 * Each game opens its own page; its title reuses the Games overview entry.
 * The tone picks the tile's tint so neighbouring games read apart (#2345 B).
 */
const GAME_PRESENTATION: Record<
  WaitingGameKind,
  { route: string; entry: string; tone: 'shared' | 'cool' | 'warm' | 'garden' }
> = {
  WHO_OF_US: {
    route: GAMES_WHO_OF_US_ROUTE,
    entry: 'perspective',
    tone: 'shared',
  },
  WISH_DETECTIVE: {
    route: GAMES_WISH_DETECTIVE_ROUTE,
    entry: 'wishes',
    tone: 'warm',
  },
  OUR_MOMENTS: { route: GAMES_MOMENTS_ROUTE, entry: 'moments', tone: 'cool' },
  PICTURE_PING_PONG: {
    route: GAMES_PICTURE_PING_PONG_ROUTE,
    entry: 'pingPong',
    tone: 'cool',
  },
  HEART_HUNT: {
    route: GAMES_HEART_HUNT_ROUTE,
    entry: 'heartHunt',
    tone: 'warm',
  },
  GARDEN_SEED: { route: GAMES_GARDEN_ROUTE, entry: 'garden', tone: 'garden' },
  GARDEN_BOUQUET: {
    route: GAMES_GARDEN_ROUTE,
    entry: 'garden',
    tone: 'garden',
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
 * Games that wait on the reader, one small circle each with a single way in
 * (#2158 C; circles since #2345 B, Product Owner 2026-11-27). On by default but it renders nothing while nothing waits, while
 * it loads or fails, and without `games.couple` (then it reads nothing).
 * Each circle names the game and what it asks, never its content.
 */
export function WirWaitingGamesModule({
  gamesApi,
  entitlementApi,
  accountId,
  spaceId,
  visible,
}: {
  gamesApi: Pick<GamesApi, 'getWaitingGames'>;
  entitlementApi: EntitlementsApi;
  accountId: string;
  spaceId: string;
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
  // Wir stays mounted while a game is open; each return reads what waits
  // again, so a turn just played has left when Wir shows again (#2345).
  usePrimaryTabReturn(() => {
    if (!allowed) return;
    void queryClient.invalidateQueries({
      queryKey: waitingGamesQueryKey(accountId, spaceId),
      exact: true,
    });
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
  // A game that waits again later (a new turn) arrives again.
  const turnKey = (item: WaitingGameView) =>
    `${item.game}:${item.since.toISOString()}`;
  const arrivals = useCardArrivals(
    `${accountId}:${spaceId}:games`,
    items.map(turnKey),
  );
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
      <ul className="wir-lists-row wir-tile-reel wir-waiting-games">
        {items.map((item: WaitingGameView) => {
          const game = GAME_PRESENTATION[item.game];
          return (
            <li
              key={item.game}
              className={`wir-game-tile-item${cardArrivalClass(arrivals.get(turnKey(item)))}`}
            >
              <TodayDestinationLink
                to={game.route}
                className={`wir-game-tile wir-game-tile-${game.tone}`}
                selectedKey={`wir-waiting-${item.game}`}
              >
                <span className="wir-game-face">
                  <WirGameTileArt game={item.game} />
                </span>
                <span className="wir-game-label" aria-hidden="true">
                  {t(`games.waiting.labels.${item.game}`)}
                </span>
                <span className="sr-only">
                  {`${t(`games.entries.${game.entry}.title`)}: ${t(`games.waiting.reasons.${item.game}`)}`}
                </span>
              </TodayDestinationLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
