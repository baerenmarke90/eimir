import {
  HEART_MOMENT_CREATE_ROUTE,
  MEMORY_CREATE_ROUTE,
  MILESTONE_CREATE_ROUTE,
} from '../client/routes';
import {
  ContextualCreateMenu,
  type ContextualCreateTarget,
} from './ContextualCreateMenu';

const targets = [
  {
    to: MEMORY_CREATE_ROUTE,
    labelKey: 'composer.diaryEntry',
    icon: 'erinnerungen',
  },
  {
    to: HEART_MOMENT_CREATE_ROUTE,
    labelKey: 'story.kind.heartMoment',
    icon: 'denken',
  },
  {
    to: MILESTONE_CREATE_ROUTE,
    labelKey: 'story.kind.milestone',
    icon: 'meilensteine',
  },
] as const satisfies readonly ContextualCreateTarget[];

/** A bounded local entry into the existing moment capture tasks. */
export function MomentCreateMenu({ floating = false }: { floating?: boolean }) {
  return (
    <ContextualCreateMenu
      labelKey="story.addMoment"
      targets={targets}
      taskItemKey="moment-create"
      floating={floating}
    />
  );
}
