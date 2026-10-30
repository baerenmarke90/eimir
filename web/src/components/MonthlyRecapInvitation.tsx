import { useQuery } from '@tanstack/react-query';
import type { RecapsApi } from '../api/generated/apis/RecapsApi';
import { normalizeClientError } from '../client/problemDetails';
import {
  monthlyRecapInvitation,
  recapPeriodLabel,
  recapPeriodStatus,
} from '../client/recaps';
import { MORE_PASSPORT_ROUTE, recapDetailPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { RecapMedia, type RecapMediaProps } from './RecapMedia';
import { TodayDestinationLink } from './TodayDestinationLink';
import './MonthlyRecapInvitation.css';

/** Read-only discovery: Wir never schedules inference or shows fabricated covers. */
export function MonthlyRecapInvitation({
  api,
  today,
  instance,
  excludeSourceIds = [],
  ...media
}: RecapMediaProps & {
  api: RecapsApi;
  today: Date;
  instance: string;
  excludeSourceIds?: readonly string[];
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: [
      'monthly-recap-invitation',
      instance,
      media.account.id,
      media.spaceId,
    ],
    queryFn: async ({ signal }) => {
      try {
        return await api.getRecapOverview(
          { spaceId: media.spaceId, kind: 'MONTH' },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const value =
    !query.isError && query.data
      ? monthlyRecapInvitation(query.data.editions, today)
      : undefined;
  const source = value?.sources.find((item) => item.available);
  const cover =
    source?.previewAttachmentId && !excludeSourceIds.includes(source.id)
      ? source
      : undefined;
  return (
    <div className="monthly-recap-entry">
      {value ? (
        <article
          className={`monthly-recap-invitation${cover ? ' has-photo' : ''}`}
        >
          {cover ? (
            <div className="monthly-recap-photo">
              <RecapMedia {...media} source={cover} />
            </div>
          ) : null}
          <div className="monthly-recap-copy">
            <span className="monthly-recap-kicker">
              {t('recaps.shortTitle')}
            </span>
            <h3>
              {t('recaps.watchMonth', {
                period: recapPeriodLabel(value, resolvedLocale()),
              })}
            </h3>
            <p>{recapPeriodStatus(value, resolvedLocale(), t)}</p>
            <TodayDestinationLink
              to={`${recapDetailPath(value.id)}?play=1`}
              className="button-link monthly-recap-watch"
            >
              <span aria-hidden="true">▶</span> {t('recaps.watchNow')}
            </TodayDestinationLink>
          </div>
        </article>
      ) : null}
      <TodayDestinationLink
        to={MORE_PASSPORT_ROUTE}
        className="monthly-recap-library-link"
      >
        {t(value ? 'recaps.allRecaps' : 'recaps.profileLink')}{' '}
        <span aria-hidden="true">→</span>
      </TodayDestinationLink>
    </div>
  );
}
