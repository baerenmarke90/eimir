import { QueryClient } from '@tanstack/react-query';
import {
  authorSummaryQueryKeys,
  invalidateAuthorSummaryConsumers,
  invalidatePlaceConsumers,
  invalidateStoryProjections,
} from './authorSummaryConsumers';

describe('invalidateAuthorSummaryConsumers', () => {
  it('triggers query invalidation on all primary AuthorSummary consumer caches using canonical keys', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const spaceId = 'space-123';
    const accountId = 'acc-456';

    await invalidateAuthorSummaryConsumers(queryClient, spaceId, accountId);

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );

    // Canonical key assertions
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.story(spaceId));
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.memory(spaceId));
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.heartMoment(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.milestone(spaceId),
    );
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.activity(spaceId));
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.legacyActivity(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.dashboard(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.notifications(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.notificationUnreadCount(spaceId),
    );
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.search(spaceId));
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.wishes(spaceId));
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.plans(spaceId));
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.places(spaceId));
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.chapters(spaceId));
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.collections(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.relationTargets(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.wishDetail(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.planDetail(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.placeDetail(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.chapterDetail(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.collectionDetail(spaceId),
    );
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.comments(spaceId));
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.profileIdentity(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.profileIdentity(spaceId, accountId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.partnerIdentity(spaceId),
    );
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.partnerProfile(spaceId),
    );
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.space(spaceId));
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.spaceProfile(spaceId),
    );

    // Exact key structure regressions: verify actual prefixes match runtime consumers
    expect(calledKeys).toContainEqual(['m5-s5', 'activity', spaceId]);
    expect(calledKeys).toContainEqual(['heartMoment', spaceId]);
    expect(calledKeys).toContainEqual(['m5-s3', 'wish', spaceId]);
    expect(calledKeys).toContainEqual(['m5-s3', 'plan', spaceId]);
    expect(calledKeys).toContainEqual(['m5-s3', 'places', spaceId, 'detail']);
    expect(calledKeys).toContainEqual(['m5-s3', 'chapter', spaceId]);
    expect(calledKeys).toContainEqual(['m5-s3', 'collection', spaceId]);

    // Regression checks: ensure obsolete prefixes without domain namespaces are not emitted
    expect(calledKeys).not.toContainEqual(['heart-moment', spaceId]);
    expect(calledKeys).not.toContainEqual(['wish', spaceId]);
    expect(calledKeys).not.toContainEqual(['plan', spaceId]);
    expect(calledKeys).not.toContainEqual(['place', spaceId]);
    expect(calledKeys).not.toContainEqual(['collection', spaceId]);
  });
});

describe('planning cache contracts', () => {
  it('invalidates every Place consumer in one Space without a global wipe', async () => {
    const queryClient = new QueryClient();
    const keys = [
      authorSummaryQueryKeys.placesOverview('space-1'),
      authorSummaryQueryKeys.placeOptions('space-1'),
      authorSummaryQueryKeys.placeDetail('space-1', 'place-1'),
    ];
    for (const key of keys) queryClient.setQueryData(key, { value: key });
    const otherSpaceKey = authorSummaryQueryKeys.placeOptions('space-2');
    queryClient.setQueryData(otherSpaceKey, []);

    await invalidatePlaceConsumers(queryClient, 'space-1');

    for (const key of keys) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryState(otherSpaceKey)?.isInvalidated).toBe(false);
  });

  it('invalidates Story and relation-target projections together', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateStoryProjections(queryClient, 'space-1');

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(calledKeys).toContainEqual(authorSummaryQueryKeys.story('space-1'));
    expect(calledKeys).toContainEqual(
      authorSummaryQueryKeys.relationTargets('space-1'),
    );
  });

  it('refreshes relation targets after create, edit, delete, and privacy transitions', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const relationKey = authorSummaryQueryKeys.relationTargets('space-1');
    let eligibleTargets: Array<{ id: string; title: string }> = [];
    const loadTargets = () => Promise.resolve([...eligibleTargets]);
    const readTargets = () =>
      queryClient.fetchQuery({ queryKey: relationKey, queryFn: loadTargets });

    expect(await readTargets()).toEqual([]);

    eligibleTargets = [{ id: 'memory-1', title: 'Picnic' }];
    await invalidateStoryProjections(queryClient, 'space-1');
    expect(await readTargets()).toEqual(eligibleTargets);

    eligibleTargets = [{ id: 'memory-1', title: 'Picnic by the lake' }];
    await invalidateStoryProjections(queryClient, 'space-1');
    expect(await readTargets()).toEqual(eligibleTargets);

    eligibleTargets = [];
    await invalidateStoryProjections(queryClient, 'space-1');
    expect(await readTargets()).toEqual([]);

    eligibleTargets = [{ id: 'heart-1', title: 'A shared smile' }];
    await invalidateStoryProjections(queryClient, 'space-1');
    expect(await readTargets()).toEqual(eligibleTargets);

    // A visibility change to private is represented by the authorized server
    // projection omitting the target; invalidation must remove the stale choice.
    eligibleTargets = [];
    await invalidateStoryProjections(queryClient, 'space-1');
    expect(await readTargets()).toEqual([]);
  });
});
