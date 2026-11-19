import { Navigate, useParams } from 'react-router-dom';
import { planIdFromShortId } from '../client/planShortLink';
import { DEFAULT_APP_ROUTE, planDetailPath } from '../client/routes';

/**
 * Opens the plan behind a calendar event's short link. The redirect replaces
 * the history entry so Back leaves the plan instead of bouncing on the link.
 */
export function PlanShortLinkRedirect() {
  const { shortId = '' } = useParams();
  const planId = planIdFromShortId(shortId);
  return (
    <Navigate
      replace
      to={planId ? planDetailPath(planId) : DEFAULT_APP_ROUTE}
    />
  );
}
