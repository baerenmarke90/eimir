import type { RefObject } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { useTranslation } from '../i18n';
import { PlanCalendarAction } from './PlanCalendarAction';
import {
  PlanCalendarSyncLine,
  type PlanCalendarSyncSource,
  usePlanCalendarSync,
} from './PlanCalendarSyncLine';
import { ShortTaskSheet } from './ShortTaskSheet';

/**
 * With a shared calendar, its state comes first, because it is what already
 * happened; the personal hand-off follows as the optional "also" action.
 */
function SyncedCalendarBody({
  plan,
  location,
  sync,
}: {
  plan: PlanDetail;
  location?: string;
  sync: PlanCalendarSyncSource;
}) {
  const state = usePlanCalendarSync(sync);
  return (
    <>
      {state ? <PlanCalendarSyncLine sync={state} /> : null}
      <PlanCalendarAction
        plan={plan}
        location={location}
        also={state?.synced ?? false}
      />
    </>
  );
}

/**
 * The calendar belongs to the date it describes: tapping the date opens this
 * sheet with the hand-off and, when the Space syncs to a shared calendar, the
 * state of that sync with its check mark.
 */
export function PlanCalendarSheet({
  open,
  onClose,
  restoreFocusRef,
  plan,
  location,
  sync,
}: {
  open: boolean;
  onClose: () => void;
  restoreFocusRef: RefObject<HTMLElement | null>;
  /** The plan as the calendar may know it (a discreet plan is already masked). */
  plan: PlanDetail;
  location?: string;
  sync?: PlanCalendarSyncSource;
}) {
  const { t } = useTranslation();
  return (
    <ShortTaskSheet
      open={open}
      title={t('calendarPlan.sheetTitle')}
      closeLabel={t('calendarPlan.sheetClose')}
      className="plan-calendar-sheet"
      restoreFocusRef={restoreFocusRef}
      onClose={onClose}
    >
      <div className="plan-calendar-sheet-body">
        {sync ? (
          <SyncedCalendarBody plan={plan} location={location} sync={sync} />
        ) : (
          <PlanCalendarAction plan={plan} location={location} />
        )}
      </div>
    </ShortTaskSheet>
  );
}
