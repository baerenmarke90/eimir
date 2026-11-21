import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import type { GardenHistoryPage } from '../api/generated/models/GardenHistoryPage';
import { historyDays } from '../client/gardenHistory';
import { useTranslation } from '../i18n';
import { SeedIcon } from './GardenArt';
import './GardenHistory.css';

export type LoadGardenHistory = (
  cursor: string | null,
) => Promise<GardenHistoryPage>;

export function gardenHistoryQueryKey(accountId: string, spaceId: string) {
  return ['games', 'garden', 'history', accountId, spaceId] as const;
}

/**
 * "Eure Geschichte" (#2158 G): what happened between the two in the garden,
 * newest first, at the bottom of the garden page. It reads one page at a
 * time and offers more on request; a new answer of the garden (a seed sent,
 * planted or watered by either partner) refreshes it.
 */
export function GardenHistory({
  accountId,
  spaceId,
  load,
  today,
  names,
  version,
}: {
  accountId: string;
  spaceId: string;
  load: LoadGardenHistory;
  /** The couple's calendar day, for "Heute" and "Gestern". */
  today: Date;
  names: { own: string; partner: string };
  /** Changes whenever the garden changed; the history then follows. */
  version: unknown;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => gardenHistoryQueryKey(accountId, spaceId),
    [accountId, spaceId],
  );
  const query = useInfiniteQuery<
    GardenHistoryPage,
    Error,
    InfiniteData<GardenHistoryPage, string | null>,
    typeof queryKey,
    string | null
  >({
    queryKey,
    initialPageParam: null,
    retry: false,
    queryFn: ({ pageParam }) => load(pageParam),
    getNextPageParam: (page) =>
      page.hasMore ? (page.nextCursor ?? undefined) : undefined,
  });
  const seen = useRef(version);
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey, version]);

  const entries = query.data?.pages.flatMap((page) => page.items) ?? [];
  const days = historyDays(entries, today, accountId, names, t);
  const colour = (role: 'own' | 'partner') =>
    role === 'own'
      ? 'var(--person-own-accent)'
      : 'var(--person-partner-accent)';

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <p className="garden-history-note" role="status">
        {t('games.garden.history.loading')}
      </p>
    );
  } else if (query.isError && entries.length === 0) {
    body = (
      <div className="garden-history-problem">
        <p className="garden-history-note">{t('games.garden.history.error')}</p>
        <button
          type="button"
          className="secondary"
          onClick={() => void query.refetch()}
        >
          {t('games.garden.history.retry')}
        </button>
      </div>
    );
  } else if (days.length === 0) {
    body = (
      <p className="garden-history-note">{t('games.garden.history.empty')}</p>
    );
  } else {
    body = (
      <>
        <ol className="garden-history-days">
          {days.map((day) => (
            <li key={day.day} className="garden-history-day">
              <h3 className="garden-history-date">
                <time dateTime={day.day}>{day.label}</time>
              </h3>
              <ul className="garden-history-entries">
                {day.lines.map((line) => (
                  <li
                    key={line.key}
                    className={`garden-history-entry${line.role === 'both' ? ' is-both' : ` person-role-${line.role}`}`}
                    data-testid="garden-history-entry"
                  >
                    <span className="garden-history-mark" aria-hidden="true">
                      {line.marks.length > 0 ? (
                        line.marks.map((mark, index) => (
                          <SeedIcon
                            // Flowers of one bouquet may repeat a species.
                            // biome-ignore lint/suspicious/noArrayIndexKey: fixed order
                            key={index}
                            species={mark.species}
                            colour={colour(mark.role)}
                            size={line.marks.length > 1 ? 22 : 30}
                          />
                        ))
                      ) : (
                        <span className="garden-history-dot" />
                      )}
                    </span>
                    <span className="garden-history-text">
                      <span>{line.text}</span>
                      {line.detail ? (
                        <span className="garden-history-detail">
                          {line.detail}
                        </span>
                      ) : null}
                      {line.words ? (
                        <span className="garden-history-words">
                          {t('games.garden.quoted', {
                            words: t(`games.garden.words.${line.words}`),
                          })}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {query.hasNextPage ? (
          <div className="garden-history-more">
            <button
              type="button"
              className="secondary"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage
                ? t('games.garden.history.loadingMore')
                : t('games.garden.history.more')}
            </button>
            {query.isFetchNextPageError ? (
              <p className="garden-history-note" role="status">
                {t('games.garden.history.moreError')}
              </p>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section
      className="garden-card garden-history"
      aria-labelledby="garden-history-title"
      data-testid="garden-history"
    >
      <h2 id="garden-history-title">{t('games.garden.history.title')}</h2>
      <p className="garden-history-intro">{t('games.garden.history.intro')}</p>
      {body}
    </section>
  );
}
