import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { WishSelectionsApi } from '../api/generated/apis/WishSelectionsApi';
import { WISH_SELECTION_ROUTE } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './WishSelection.css';

/**
 * Read-only round state for the entry row only. Personal projection: never
 * register this key with the durable read cache.
 */
export function wishSelectionEntryQueryKey(
  apiBaseUrl: string,
  accountId: string,
  spaceId: string,
) {
  return ['wish-selection-entry', apiBaseUrl, accountId, spaceId] as const;
}

/**
 * The single "what do we do next" entry on Planen > Wünsche > Offen (#1907 J1).
 * One slim row with one filled action replaces the former selection link and
 * the separate date-idea card; both sources are chosen inside the round. While
 * a round is open, the row says so and continues it. The destination stays an
 * ordinary link for modified clicks and deep links.
 */
export function WishSelectionEntry({
  api,
  apiBaseUrl = '',
  accountId,
  spaceId,
  active = true,
}: {
  api?: WishSelectionsApi;
  apiBaseUrl?: string;
  accountId?: string;
  spaceId: string;
  /** Hidden planning panels stay mounted; read the round only when visible. */
  active?: boolean;
}) {
  const { t } = useTranslation();
  const { captureOrigin } = useTaskOrigin();
  const navigate = useNavigate();
  const round = useQuery({
    queryKey: wishSelectionEntryQueryKey(apiBaseUrl, accountId ?? '', spaceId),
    queryFn: () =>
      (api as WishSelectionsApi).getWishSelection({
        spaceId,
        locale: resolvedLocale(),
      }),
    enabled: Boolean(api && accountId && active),
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
  });
  const running = Boolean(round.data?.id);
  return (
    <section
      className="wish-selection-entry"
      aria-labelledby="wish-selection-entry-title"
    >
      <EimirIcon name="gemeinsam" className="wish-selection-entry-icon" />
      <span className="wish-selection-entry-text">
        <strong id="wish-selection-entry-title">
          {t('wishSelection.entryTitle')}
        </strong>
        <span id="wish-selection-entry-hint">
          {t(
            running ? 'wishSelection.entryRunning' : 'wishSelection.entryHint',
          )}
        </span>
      </span>
      <Link
        className="button-link wish-selection-entry-action"
        to={WISH_SELECTION_ROUTE}
        aria-describedby="wish-selection-entry-title wish-selection-entry-hint"
        onClick={(event) => {
          // Keep the ordinary link/deep-link destination. Only an unmodified
          // activation carries the current hub's bounded return context.
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          const key = captureOrigin({ planningSegment: 'wishes' });
          void navigate(WISH_SELECTION_ROUTE, {
            state: { taskOriginKey: key },
          });
        }}
      >
        {t(running ? 'common.continue' : 'wishSelection.entryStart')}
      </Link>
    </section>
  );
}
