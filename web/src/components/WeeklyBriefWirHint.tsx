import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import {
  DAILY_INSIGHTS_CAPABILITY,
  loadWeeklyBrief,
  weeklyBriefQueryKey,
} from '../client/dailyInsights';
import { addDays, mondayOf } from '../client/dailyInsightsModel';
import { localDay, quietHintRetired, useQuietHint } from '../client/quietHints';
import { MORE_INSIGHTS_ROUTE } from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { useTranslation } from '../i18n';
import { QuietHint } from './QuietHint';

/** One quiet-hint id per completed week, so a new week may show it again. */
export function weeklyBriefHintId(monday: string): string {
  return `weeklyBrief:${monday}`;
}

/** Monday of the last completed week, in the viewer's calendar. */
export function lastCompletedMonday(today = localDay()): string {
  return addDays(mondayOf(today), -7);
}

/**
 * A quiet Wir hint that last week's weekly brief is ready (#2194, Product
 * Owner 2026-11-22). Pro only, never a teaser; it shows no brief content and
 * follows the quiet-hint limits: one per screen, one new per day, retired
 * after dismissal, three sessions or opening that week's brief.
 */
export function WeeklyBriefWirHint({
  accountId,
  spaceId,
  dailyCheckInsApi,
  entitlementApi,
  modulesEnabled,
}: {
  accountId: string;
  spaceId: string;
  dailyCheckInsApi: DailyCheckInsApi;
  entitlementApi: EntitlementsApi;
  /** Vibe or Energy is enabled for the Space. */
  modulesEnabled: boolean;
}) {
  const { t } = useTranslation();
  const [monday] = useState(() => lastCompletedMonday());
  const hintId = weeklyBriefHintId(monday);
  // Nothing is read once this week's hint retired on this device.
  const [retired] = useState(() =>
    quietHintRetired(accountId, spaceId, hintId),
  );
  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlementApi, spaceId),
    [entitlementApi, spaceId],
  );
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    enabled: !retired && modulesEnabled,
    capability: DAILY_INSIGHTS_CAPABILITY,
  });
  const allowed = !retired && modulesEnabled && capability.data === true;
  const brief = useQuery({
    queryKey: weeklyBriefQueryKey(accountId, spaceId, monday),
    queryFn: ({ signal }) =>
      loadWeeklyBrief(dailyCheckInsApi, spaceId, monday, signal),
    enabled: allowed,
    retry: false,
    gcTime: 0,
  });
  const data = brief.data;
  const hasContent = Boolean(
    data && (data.jointDays > 0 || data.highlight || data.followUp),
  );
  const { activeId, dismiss } = useQuietHint(accountId, spaceId, [
    { id: hintId, eligible: allowed && hasContent },
  ]);
  const [closed, setClosed] = useState(false);

  if (activeId !== hintId || closed) return null;
  return (
    <div className="weekly-brief-wir-hint">
      <QuietHint
        action={{
          to: `${MORE_INSIGHTS_ROUTE}?week=${monday}`,
          label: t('dailyInsights.brief.wirHint.open'),
        }}
        dismissLabel={t('dailyInsights.brief.wirHint.later')}
        onDismiss={() => {
          dismiss();
          setClosed(true);
        }}
      >
        {t('dailyInsights.brief.wirHint.text')}
      </QuietHint>
    </div>
  );
}
