import {
  StoryPlanningLinks,
  type StoryPlanningLinksProps,
} from './StoryPlanningLinks';

/** Preserve the established Memory consumer while sharing its Plan-link lifecycle. */
export function MemoryPlanningLinks({
  memoryId,
  ...props
}: Omit<StoryPlanningLinksProps, 'contentId' | 'sourceKind'> & {
  memoryId: string;
}) {
  return (
    <StoryPlanningLinks {...props} sourceKind="MEMORY" contentId={memoryId} />
  );
}
