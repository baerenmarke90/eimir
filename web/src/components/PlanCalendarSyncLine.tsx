import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from '../client/apiConfiguration';
import { calendarSyncApi } from '../client/calendarSync';
import { SETTINGS_CATEGORY_ROUTES } from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './PlanCalendarAction.css';

export type PlanCalendarSyncSource = {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  planId: string;
  planVersion: number;
};

/**
 * The Plan's state in the Space's shared calendar (#1895), or null when the
 * Space has no shared calendar. It distinguishes the saved Plan from a
 * confirmed external event.
 */
export function usePlanCalendarSync(props: PlanCalendarSyncSource) {
  const api = useMemo(
    () => calendarSyncApi(props.apiBaseUrl, props.accessToken),
    [props.apiBaseUrl, props.accessToken],
  );
  const loadEntitlement = useMemo(
    () =>
      entitlementLoader(
        new EntitlementsApi(
          new Configuration({
            basePath: props.apiBaseUrl,
            headers: { Authorization: `Bearer ${props.accessToken}` },
          }),
        ),
        props.spaceId,
      ),
    [props.apiBaseUrl, props.accessToken, props.spaceId],
  );
  // Reuses the session's single entitlement read; Free Spaces never ask for
  // a sync state they cannot have, so opening a Plan costs no extra request.
  const capability = useSpaceCapability({
    accountId: props.accountId,
    spaceId: props.spaceId,
    load: loadEntitlement,
    capability: 'integration.external_sync',
  });
  const query = useQuery({
    enabled: capability.data === true,
    queryKey: [
      'calendar-sync-plan',
      props.apiBaseUrl,
      props.accountId,
      props.spaceId,
      props.planId,
      props.planVersion,
    ],
    queryFn: ({ signal }) =>
      api.getPlanCalendarSync(
        { spaceId: props.spaceId, planId: props.planId },
        { signal },
      ),
    retry: false,
    staleTime: 30_000,
  });
  const view = query.data;
  if (!view?.targetStatus) return null;
  const paused = view.targetStatus !== 'ACTIVE';
  if (view.state === 'NOT_SYNCED' && !paused) return null;
  return {
    state: view.state,
    paused,
    synced: view.state === 'SYNCED' && !paused,
    needsReview: view.state === 'CONFLICT' || view.state === 'FAILED',
  };
}

export type PlanCalendarSync = NonNullable<
  ReturnType<typeof usePlanCalendarSync>
>;

/**
 * The shared calendar's state as the first line of the calendar sheet: a
 * success check once the event exists there, otherwise the state with a way
 * to review it in the calendar settings.
 */
export function PlanCalendarSyncLine({ sync }: { sync: PlanCalendarSync }) {
  const { t } = useTranslation();
  const { paused, needsReview, synced } = sync;
  const label = paused
    ? t('calendarSync.plan.paused')
    : t(`calendarSync.plan.${sync.state}`);
  return (
    <p
      className="plan-calendar-sync-line"
      data-synced={synced || undefined}
      role="status"
    >
      <EimirIcon name={synced ? 'check' : 'kalender'} />
      <span>{label}</span>
      {needsReview || paused ? (
        <Link to={SETTINGS_CATEGORY_ROUTES.calendar}>
          {t('calendarSync.plan.review')}
        </Link>
      ) : null}
    </p>
  );
}
