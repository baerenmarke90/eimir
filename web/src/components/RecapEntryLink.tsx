import { useQuery } from '@tanstack/react-query';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { RecapsApi } from '../api/generated/apis/RecapsApi';
import type { RecapView } from '../api/generated/models/RecapView';
import { normalizeClientError } from '../client/problemDetails';
import { recapEntryEdition, recapPeriodLabel } from '../client/recaps';
import { STORY_RECAPS_ROUTE } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { RecapMedia, type RecapMediaProps } from './RecapMedia';

/** Read-only discovery for Momente: the newest edition, never an invented one. */
export function useRecapEntry({
  api,
  accountId,
  spaceId,
}: {
  api?: RecapsApi;
  accountId: string;
  spaceId: string;
}): RecapView | undefined {
  const query = useQuery({
    queryKey: ['recap-entry', accountId, spaceId],
    enabled: Boolean(api),
    queryFn: async ({ signal }) => {
      if (!api) throw new Error('Recap discovery is unavailable.');
      try {
        return await api.getRecapOverview(
          { spaceId, kind: 'MONTH' },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    staleTime: 30_000,
  });
  return query.isError || !query.data
    ? undefined
    : recapEntryEdition(query.data.editions);
}

/** The row exists only where the group is shown, so no read happens elsewhere. */
export function RecapEntry({
  api,
  onOpen,
  ...media
}: RecapMediaProps & {
  api?: RecapsApi;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
}) {
  const edition = useRecapEntry({
    api,
    accountId: media.account.id,
    spaceId: media.spaceId,
  });
  return edition ? (
    <RecapEntryLink edition={edition} onOpen={onOpen} {...media} />
  ) : null;
}

/** One row in the couple-experiences group: cover, period and a quiet action. */
export function RecapEntryLink({
  edition,
  onOpen,
  ...media
}: RecapMediaProps & {
  edition: RecapView;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
}) {
  const { t } = useTranslation();
  const cover = edition.sources.find(
    (source) => source.available && source.previewAttachmentId,
  );
  const ready = edition.status === 'READY';
  const period = recapPeriodLabel(edition, resolvedLocale());
  return (
    <Link
      className="recap-entry"
      to={STORY_RECAPS_ROUTE}
      onClick={(event) => onOpen(event, STORY_RECAPS_ROUTE)}
    >
      {ready && cover ? (
        <span className="recap-entry-cover" aria-hidden="true">
          <RecapMedia {...media} source={cover} />
        </span>
      ) : (
        <EimirIcon name="highlights" />
      )}
      <span>
        <strong>{t('recaps.shortTitle')}</strong>
        <span>{ready ? period : t('recaps.entryPending')}</span>
        <span className="recap-entry-action">{t('recaps.entryAction')}</span>
      </span>
    </Link>
  );
}
