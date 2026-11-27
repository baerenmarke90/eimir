import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { GamesApi } from '../api/generated/apis/GamesApi';
import type { GameNoticeSurface } from '../api/generated/models/GameNoticeSurface';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from '../client/notificationQueries';

/**
 * Opening a game page handles what its notices announced, whichever way the
 * reader came: the Wir row, the Games tab or a push (#2345). It marks the
 * reader's notices of this game read once per visit and refreshes the inbox
 * and its badge. It renders nothing; a failed call changes nothing visible and
 * the notices simply stay until read elsewhere.
 */
export function GameNoticesRead({
  gamesApi,
  spaceId,
  surface,
}: {
  gamesApi: Pick<GamesApi, 'markGameNoticesRead'>;
  spaceId: string;
  surface: GameNoticeSurface;
}) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const controller = new AbortController();
    gamesApi
      .markGameNoticesRead({ spaceId, surface }, { signal: controller.signal })
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: notificationUnreadCountQueryKey(spaceId),
          }),
          queryClient.invalidateQueries({
            queryKey: notificationsListQueryKey(spaceId),
          }),
        ]),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [gamesApi, queryClient, spaceId, surface]);
  return null;
}
