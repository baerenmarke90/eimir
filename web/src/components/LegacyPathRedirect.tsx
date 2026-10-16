import { Navigate, useLocation } from 'react-router-dom';
import { DEFAULT_APP_ROUTE, rewriteLegacyPath } from '../client/routes';

/**
 * Sends a pre-decision path to its current location.
 *
 * Query string and hash are carried over, because a legacy link may already
 * contain Story filters or an anchor. The redirect replaces the history entry
 * so Back does not bounce the user between the old and the new path.
 */
export function LegacyPathRedirect() {
  const location = useLocation();
  const rewritten = rewriteLegacyPath(location.pathname);

  return (
    <Navigate
      replace
      to={`${rewritten ?? DEFAULT_APP_ROUTE}${location.search}${location.hash}`}
    />
  );
}
