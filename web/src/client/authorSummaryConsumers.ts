import type { QueryClient } from '@tanstack/react-query';

const placeRootKey = (spaceId: string) => ['m5-s3', 'places', spaceId] as const;

/**
 * Canonical TanStack Query keys for all domain models and views that consume AuthorSummary projections.
 *
 * Sharing these keys between query hooks and invalidation helpers guarantees cache invalidation
 * hits the actual consumer keys instead of drifting constants.
 */
export const authorSummaryQueryKeys = {
  profileIdentity: (spaceId: string, accountId?: string) =>
    accountId
      ? (['profile-identity', spaceId, accountId] as const)
      : (['profile-identity', spaceId] as const),
  partnerIdentity: (spaceId: string) => ['partner-identity', spaceId] as const,
  partnerProfile: (spaceId: string, partnerId?: string) =>
    partnerId
      ? (['partner-profile', spaceId, partnerId] as const)
      : (['partner-profile', spaceId] as const),
  space: (spaceId: string) => ['space', spaceId] as const,
  spaceProfile: (spaceId: string) => ['space-profile', spaceId] as const,
  story: (spaceId: string) => ['story', spaceId] as const,
  memory: (spaceId: string, memoryId?: string) =>
    memoryId
      ? (['memory', spaceId, memoryId] as const)
      : (['memory', spaceId] as const),
  heartMoment: (spaceId: string, heartMomentId?: string) =>
    heartMomentId
      ? (['heartMoment', spaceId, heartMomentId] as const)
      : (['heartMoment', spaceId] as const),
  milestone: (spaceId: string, milestoneId?: string) =>
    milestoneId
      ? (['milestone', spaceId, milestoneId] as const)
      : (['milestone', spaceId] as const),
  comments: (spaceId: string) => ['comments', spaceId] as const,
  activity: (spaceId: string) => ['m5-s5', 'activity', spaceId] as const,
  legacyActivity: (spaceId: string) => ['m4', 'activity', spaceId] as const,
  dashboard: (spaceId: string) => ['m5-s5', 'dashboard', spaceId] as const,
  notifications: (spaceId: string) =>
    ['m5-s5', 'notifications', spaceId] as const,
  notificationUnreadCount: (spaceId: string) =>
    ['m5-s5', 'notification-unread-count', spaceId] as const,
  search: (spaceId: string) => ['m5-s5', 'search', spaceId] as const,
  wishes: (spaceId: string) => ['m5-s3', 'wishes', spaceId] as const,
  plans: (spaceId: string) => ['m5-s3', 'plans', spaceId] as const,
  places: placeRootKey,
  placesOverview: (spaceId: string) =>
    [...placeRootKey(spaceId), 'overview'] as const,
  placeOptions: (spaceId: string) =>
    [...placeRootKey(spaceId), 'options'] as const,
  chapters: (spaceId: string) => ['m5-s3', 'chapters', spaceId] as const,
  collections: (spaceId: string) => ['m5-s3', 'collections', spaceId] as const,
  relationTargets: (spaceId: string) =>
    ['m5-s3', 'relation-targets', spaceId] as const,
  wishDetail: (spaceId: string, wishId?: string) =>
    wishId
      ? (['m5-s3', 'wish', spaceId, wishId] as const)
      : (['m5-s3', 'wish', spaceId] as const),
  planDetail: (spaceId: string, planId?: string) =>
    planId
      ? (['m5-s3', 'plan', spaceId, planId] as const)
      : (['m5-s3', 'plan', spaceId] as const),
  placeDetail: (spaceId: string, placeId?: string) =>
    placeId
      ? ([...placeRootKey(spaceId), 'detail', placeId] as const)
      : ([...placeRootKey(spaceId), 'detail'] as const),
  chapterDetail: (spaceId: string, chapterId?: string) =>
    chapterId
      ? (['m5-s3', 'chapter', spaceId, chapterId] as const)
      : (['m5-s3', 'chapter', spaceId] as const),
  collectionDetail: (spaceId: string, collectionId?: string) =>
    collectionId
      ? (['m5-s3', 'collection', spaceId, collectionId] as const)
      : (['m5-s3', 'collection', spaceId] as const),
};

/** Invalidate every Place view and selector in one Space without touching another Space. */
export async function invalidatePlaceConsumers(
  queryClient: QueryClient,
  spaceId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: authorSummaryQueryKeys.places(spaceId),
  });
}

/** Keep the Story timeline and its relation-target projection coherent. */
export async function invalidateStoryProjections(
  queryClient: QueryClient,
  spaceId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.story(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.relationTargets(spaceId),
    }),
  ]);
}

/**
 * Centrally invalidates all TanStack Query caches that consume AuthorSummary projections.
 *
 * When an account's presentation identity changes, this helper ensures that all
 * timelines, profile/date projections, activity logs, dashboards, comments, and
 * collaborative items in the space immediately refetch the fresh identity.
 */
export async function invalidateAuthorSummaryConsumers(
  queryClient: QueryClient,
  spaceId: string,
  accountId?: string,
): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.profileIdentity(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.partnerIdentity(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.partnerProfile(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.space(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.spaceProfile(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.story(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.memory(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.heartMoment(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.milestone(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.activity(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.legacyActivity(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.dashboard(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.notifications(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.notificationUnreadCount(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.search(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.wishes(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.plans(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.places(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.chapters(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.collections(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.relationTargets(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.wishDetail(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.planDetail(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.placeDetail(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.chapterDetail(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.collectionDetail(spaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: authorSummaryQueryKeys.comments(spaceId),
    }),
  ];

  if (accountId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: authorSummaryQueryKeys.profileIdentity(spaceId, accountId),
      }),
    );
  }

  await Promise.all(invalidations);
}
