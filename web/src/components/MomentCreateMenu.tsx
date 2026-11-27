import {
  COLLECTION_CREATE_ROUTE,
  HEART_MOMENT_CREATE_ROUTE,
  MEMORY_CREATE_ROUTE,
  MILESTONE_CREATE_ROUTE,
  PLAN_CREATE_ROUTE,
  WISH_CREATE_ROUTE,
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

/**
 * Wir is the overview, so its create button offers every create task, not
 * only moments (#2063, Product Owner 2026-11-19). Each target opens the same
 * existing create page as its own area does.
 */
const everythingTargets = [
  ...targets,
  {
    to: PLAN_CREATE_ROUTE,
    labelKey: 'navigation.quickCreatePlan',
    icon: 'planen',
  },
  {
    to: WISH_CREATE_ROUTE,
    labelKey: 'navigation.quickCreateWish',
    icon: 'wuensche',
  },
  {
    to: COLLECTION_CREATE_ROUTE,
    labelKey: 'navigation.quickCreateList',
    icon: 'listen',
  },
] as const satisfies readonly ContextualCreateTarget[];

/** A bounded local entry into the existing moment capture tasks. */
export function MomentCreateMenu({
  floating = false,
  everything = false,
  taskItemKey = 'moment-create',
}: {
  floating?: boolean;
  /** Distinguishes a second instance on the same screen (the top bar's). */
  taskItemKey?: string;
  /** Also offer Plan, Wish and List (the Wir overview). */
  everything?: boolean;
}) {
  return (
    <ContextualCreateMenu
      labelKey={everything ? 'navigation.quickCreateTitle' : 'story.addMoment'}
      targets={everything ? everythingTargets : targets}
      taskItemKey={taskItemKey}
      floating={floating}
    />
  );
}
