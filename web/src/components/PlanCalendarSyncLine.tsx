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

/**
 * One quiet line under the calendar handoff when the Space syncs to a shared
 * calendar (#1895). It distinguishes the saved Plan from a confirmed external
 * event and never appears for Spaces without a shared calendar.
 */
export function PlanCalendarSyncLine(props: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  planId: string;
  planVersion: number;
}) {
  const { t } = useTranslation();
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
  const needsReview = view.state === 'CONFLICT' || view.state === 'FAILED';
  const label = paused
    ? t('calendarSync.plan.paused')
    : t(`calendarSync.plan.${view.state}`);
  return (
    <p className="plan-calendar-sync-line" role="status">
      <EimirIcon
        name={view.state === 'SYNCED' && !paused ? 'check' : 'kalender'}
      />
      <span>{label}</span>
      {needsReview || paused ? (
        <Link to={SETTINGS_CATEGORY_ROUTES.calendar}>
          {t('calendarSync.plan.review')}
        </Link>
      ) : null}
    </p>
  );
}
