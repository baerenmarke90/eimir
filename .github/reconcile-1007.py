from pathlib import Path

path = Path('web/src/components/StoryProductPage.tsx')
text = path.read_text()

old_refresh = """  const pullRefresh = usePullToRefresh({
    enabled: true,
    blocked:
      activeView === 'timeline'
        ? storyQuery.isFetching
        : discoverQuery.isFetching,
    onRefresh: () => {
      if (activeView === 'timeline') {
        return storyQuery.refetch();
      } else {
        return discoverQuery.refetch();
      }
    },
  });
"""
new_refresh = """  const [paginationGeneration, setPaginationGeneration] = useState(0);
  const pullRefresh = usePullToRefresh({
    enabled: true,
    blocked:
      activeView === 'timeline'
        ? storyQuery.isFetching
        : discoverQuery.isFetching,
    onRefresh: async () => {
      if (activeView === 'timeline') {
        const result = await storyQuery.refetch();
        if (!result.isError) {
          setPaginationGeneration((generation) => generation + 1);
        }
      } else {
        await discoverQuery.refetch();
      }
    },
  });
"""
if 'const [paginationGeneration, setPaginationGeneration]' not in text:
    if old_refresh not in text:
        raise SystemExit('Expected Slice-4 pull-refresh block not found')
    text = text.replace(old_refresh, new_refresh, 1)

sticky = """  useStickyTimelineMonths(
    timelineMonthsRef,
    activeView === 'timeline' && timelineMonthGroups.length > 0,
  );
"""
progressive = """  useStickyTimelineMonths(
    timelineMonthsRef,
    activeView === 'timeline' && timelineMonthGroups.length > 0,
  );
  useTimelineReveal({
    rootRef: timelineMonthsRef,
    enabled: activeView === 'timeline' && timelineItems.length > 0,
    scopeKey: `${spaceId}:${cacheResourceId}`,
    revision: timelineItems.length,
  });

  const nextStoryCursor = storyQuery.hasNextPage
    ? (storyQuery.data?.pages.at(-1)?.value.nextCursor ?? null)
    : null;
  const loadNextStoryPage = useCallback(async () => {
    if (
      !storyQuery.hasNextPage ||
      storyQuery.isFetchingNextPage ||
      pullRefresh.refreshing
    ) {
      return false;
    }
    const result = await storyQuery.fetchNextPage({ cancelRefetch: false });
    return !result.isError;
  }, [
    pullRefresh.refreshing,
    storyQuery.fetchNextPage,
    storyQuery.hasNextPage,
    storyQuery.isFetchingNextPage,
  ]);
  const progressivePagination = useTimelineAutoPagination({
    sentinelRef: paginationSentinelRef,
    enabled: activeView === 'timeline',
    blocked:
      (storyQuery.isFetching && !storyQuery.isFetchingNextPage) ||
      pullRefresh.refreshing ||
      restoringTimeline ||
      Boolean(offline),
    hasNextPage: Boolean(storyQuery.hasNextPage),
    isFetchingNextPage: storyQuery.isFetchingNextPage,
    cursor: nextStoryCursor,
    scopeKey: `${spaceId}:${cacheResourceId}:${paginationGeneration}`,
    loadNextPage: loadNextStoryPage,
  });
"""
if 'const progressivePagination = useTimelineAutoPagination' not in text:
    if sticky not in text:
        raise SystemExit('Expected sticky timeline hook block not found')
    text = text.replace(sticky, progressive, 1)

path.write_text(text)
