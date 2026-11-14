import { matchPath } from 'react-router-dom';
import type { ReferenceApis } from './referenceFlow';
import {
  appRoutePath,
  HEART_MOMENT_DETAIL_ROUTE_PATTERN,
  MEMORY_DETAIL_ROUTE_PATTERN,
  MILESTONE_DETAIL_ROUTE_PATTERN,
  STORY_YEAR_ROUTE_PATTERN,
  STORY_YEARS_ROUTE,
} from './routes';
import {
  parseStoryFilters,
  parseStoryYear,
  storyRequest,
  storyYearFilters,
  storyYearsIndexRequest,
} from './storyProduct';

function startRead<T>(read: Promise<T>): () => Promise<T> | undefined {
  // Keep an early failure for the normal query and its offline handling.
  void read.catch(() => undefined);
  let pending: Promise<T> | undefined = read;
  return () => {
    const result = pending;
    pending = undefined;
    return result;
  };
}

/** Start authorized network reads early. The App admits them after membership. */
export function startStoryReads(
  apis: ReferenceApis,
  accountId: string,
  spaceId: string,
  { pathname, search }: { pathname: string; search: string },
) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const scope = {
    accountId,
    spaceId,
    cancel: () => controller.abort(),
  };
  const start = <Kind extends string, T>(kind: Kind, read: Promise<T>) => ({
    ...scope,
    kind,
    take: startRead(read),
  });

  if (matchPath(appRoutePath('story'), pathname)) {
    const filters = parseStoryFilters(new URLSearchParams(search));
    return {
      ...scope,
      kind: 'diary' as const,
      takeTimeline: startRead(
        apis.story.getStoryTimeline(
          storyRequest(spaceId, filters, null),
          options,
        ),
      ),
      takeDiscover: startRead(
        apis.story.getStoryDiscover({ spaceId }, options),
      ),
    };
  }

  if (matchPath(STORY_YEARS_ROUTE, pathname))
    return start(
      'years',
      apis.story.getStoryTimeline(storyYearsIndexRequest(spaceId), options),
    );

  const year = parseStoryYear(
    matchPath(STORY_YEAR_ROUTE_PATTERN, pathname)?.params.year,
  );
  if (year !== null)
    return start(
      'year',
      apis.story.getStoryTimeline(
        storyRequest(spaceId, storyYearFilters(year), null),
        options,
      ),
    );

  const memoryId = matchPath(MEMORY_DETAIL_ROUTE_PATTERN, pathname)?.params
    .memoryId;
  if (memoryId && memoryId.toLowerCase() !== 'new')
    return start(
      'memory',
      apis.memories.getMemory({ spaceId, memoryId }, options),
    );

  const heartMomentId = matchPath(HEART_MOMENT_DETAIL_ROUTE_PATTERN, pathname)
    ?.params.heartMomentId;
  if (heartMomentId && heartMomentId.toLowerCase() !== 'new')
    return start(
      'heartMoment',
      apis.heartMoments.getHeartMoment({ spaceId, heartMomentId }, options),
    );

  const milestoneId = matchPath(MILESTONE_DETAIL_ROUTE_PATTERN, pathname)
    ?.params.milestoneId;
  if (milestoneId && milestoneId.toLowerCase() !== 'new')
    return start(
      'milestone',
      apis.milestones.getMilestone({ spaceId, milestoneId }, options),
    );

  return null;
}

export type StoryStartupReads = NonNullable<ReturnType<typeof startStoryReads>>;
