import { useEffect, useRef } from 'react';
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
  const recordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!presented || !itemId) return;
    
    // Create a composite key to ensure we only record once per item per mount
    // even if `presented` toggles (which it shouldn't normally, but just in case).
    const key = `${kind}:${itemId}`;
    if (recordedRef.current === key) return;
    
    recordedRef.current = key;

    apis.story?.recordStoryView({
      spaceId,
      storyViewReceipt: {
        kind,
        itemId,
      },
    }).catch(() => {
      // Intentional view receipt failures must not break the detail page.
      // Backend same-day idempotent semantics apply.
    });
  }, [apis, spaceId, kind, itemId, presented]);
}
