import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { DiscoverSelection } from '../api/generated/models/DiscoverSelection';
import {
  DiscoverSelectionFromJSON,
  DiscoverSelectionToJSON,
} from '../api/generated/models/DiscoverSelection';
import { stagesReleased } from '../motion/stage';
import { authorSummaryQueryKeys } from './authorSummaryConsumers';
import { loadProductWithReadCache } from './productReadCache';
import type { ReferenceApis } from './referenceFlow';

/** How long a read of Momente › Erinnerungen counts as fresh. */
export const STORY_DISCOVER_STALE_TIME = 30_000;

/**
 * The read behind Momente › Erinnerungen: the network, with the device's
 * read cache as the offline fallback. The page and the prefetch share it, so
 * a prefetched result is exactly what the page would have read.
 */
export function storyDiscoverQuery({
  apis,
  accountId,
  spaceId,
  take,
}: {
  apis: ReferenceApis;
  accountId: string;
  spaceId: string;
  /** A read already started at app start, used once. */
  take?: () => Promise<DiscoverSelection> | undefined;
}) {
  return {
    queryKey: authorSummaryQueryKeys.discover(spaceId, accountId),
    queryFn: () =>
      loadProductWithReadCache({
        accountId,
        spaceId,
        kind: 'story-discover',
        resourceId: 'discover',
        load: () => take?.() ?? apis.story.getStoryDiscover({ spaceId }),
        serialize: DiscoverSelectionToJSON,
        deserialize: (payload) => DiscoverSelectionFromJSON(payload),
      }),
  };
}

/**
 * Reads Momente › Erinnerungen ahead, so the first swipe there finds its
 * data. A failure stays silent: the page reads again when it opens.
 */
export function prefetchStoryDiscover(
  client: QueryClient,
  options: Parameters<typeof storyDiscoverQuery>[0],
): Promise<void> {
  return client.prefetchQuery({
    ...storyDiscoverQuery(options),
    staleTime: STORY_DISCOVER_STALE_TIME,
    retry: false,
  });
}

/**
 * On the native app, reads Momente › Erinnerungen ahead once per Account and
 * Space, as soon as the shown page has its data (`stagesReleased`), so a
 * swipe to Momente right after start does not wait for the network. The
 * read waits for the shown page and only fills the query cache: nothing is
 * rendered ahead.
 */
export function usePrefetchStoryDiscover({
  enabled,
  apis,
  accountId,
  spaceId,
}: {
  enabled: boolean;
  apis: ReferenceApis;
  accountId: string;
  spaceId: string;
}): void {
  const client = useQueryClient();
  const apisRef = useRef(apis);
  apisRef.current = apis;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void stagesReleased().then(() => {
      if (!live) return;
      void prefetchStoryDiscover(client, {
        apis: apisRef.current,
        accountId,
        spaceId,
      });
    });
    return () => {
      live = false;
    };
  }, [enabled, client, accountId, spaceId]);
}
