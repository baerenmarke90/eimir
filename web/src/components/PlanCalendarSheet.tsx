import type { RefObject } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { useTranslation } from '../i18n';
import { PlanCalendarAction } from './PlanCalendarAction';
import { PlanCalendarSyncLine } from './PlanCalendarSyncLine';
import { ShortTaskSheet } from './ShortTaskSheet';

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
  sync?: {
    apiBaseUrl: string;
    accessToken: string;
    accountId: string;
    spaceId: string;
    planId: string;
    planVersion: number;
  };
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
        <PlanCalendarAction plan={plan} location={location} />
        {sync ? <PlanCalendarSyncLine {...sync} /> : null}
      </div>
    </ShortTaskSheet>
  );
}
