import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardQueryKey } from './dashboardQueries';
import { captureAuthorizedQuery } from './queryIdentity';
import type { ReferenceApis } from './referenceFlow';
import type { StoryKind } from '../api/generated/models/StoryKind';

export function useStoryViewReceipt({
  apis,
  spaceId,
  kind,
  itemId,
  presented,
}: {
  apis: ReferenceApis;
  spaceId: string;
  kind: StoryKind;
  itemId: string;
  presented: boolean;
}) {
  const queryClient = useQueryClient();
  const recordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!presented || !itemId) return;

    // Create a composite key to ensure we only record once per item per mount
    // even if `presented` toggles (which it shouldn't normally, but just in case).
    const key = `${kind}:${itemId}`;
    if (recordedRef.current === key) return;

    recordedRef.current = key;
    const dashboardKey = dashboardQueryKey(spaceId);
    const current = captureAuthorizedQuery(queryClient, dashboardKey);
    let active = true;

    apis.story
      ?.recordStoryView({
        spaceId,
        storyViewReceipt: {
          kind,
          itemId,
        },
      })
      .then(() => {
        if (active && current())
          return queryClient.invalidateQueries({ queryKey: dashboardKey });
      })
      .catch(() => {
        // Intentional view receipt failures must not break the detail page.
        // Backend same-day idempotent semantics apply.
      });
    return () => {
      active = false;
    };
  }, [apis, spaceId, kind, itemId, presented, queryClient]);
}
