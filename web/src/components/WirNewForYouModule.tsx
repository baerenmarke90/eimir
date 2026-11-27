import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo } from 'react';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import { DashboardItemType } from '../api/generated/models/DashboardItemType';
import type { WirNotice } from '../api/generated/models/WirNotice';
import type { WirNotices } from '../api/generated/models/WirNotices';
import { engagementTargetPath, notificationPath } from '../client/m4Product';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from '../client/notificationQueries';

import { normalizeClientError } from '../client/problemDetails';
import { MORE_NOTIFICATIONS_ROUTE } from '../client/routes';
import { cardArrivalClass, useCardArrivals } from '../client/useCardArrivals';
import { resolvedLocale, type TranslateText, useTranslation } from '../i18n';

import { PHOTO_REACTIONS } from './MemoryPhotoGallery';
import { TodayDestinationLink } from './TodayDestinationLink';
import './WirCardArrival.css';
import './WirLists.css';
import './WirNewForYouModule.css';

/**
 * Lives under the notification list key, so every read anywhere (inbox, a
 * push, a game page) that refreshes the list also refreshes Wir (#2345 B).
 */
export function wirNoticesQueryKey(spaceId: string) {
  return [...notificationsListQueryKey(spaceId), 'wir'] as const;
}

type Art =
  | 'today'
  | 'date'
  | 'selection'
  | 'list'
  | 'note'
  | 'picture'
  | 'heart'
  | 'bubble'
  | 'reaction';

interface Tile {
  key: string;
  ids: string[];
  path: string;
  tone: 'brand' | 'warm' | 'cool' | 'deep-warm' | 'deep-cool' | 'paper';
  art: Art;
  kind: string;
  title: string;
  line: string;
  time?: string;
  weekday?: string;
  day?: string;
  items?: string[];
  moreItems?: string;
  moreCount?: number;
  quote?: string;
  reaction?: string;
}

/** Entries a list circle previews; more would outgrow the small circle. */
const LIST_PREVIEW_ITEMS = 1;

const FOLDED_KINDS = new Set(['COMMENT_CREATED', 'PHOTO_REACTION']);

function dayKey(value: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

/** Today's plans from the dashboard read, in the person's own day. */
export function todayPlanTiles(
  upcoming: readonly DashboardItem[],
  viewerLocalDate: Date | null | undefined,
  t: TranslateText,
  locale: string,
): Tile[] {
  if (!viewerLocalDate) return [];
  const today = dayKey(viewerLocalDate, 'UTC');
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const tiles: Tile[] = [];
  for (const item of upcoming) {
    if (item.type !== DashboardItemType.PLAN || !item.titleOrText?.trim())
      continue;
    const path = engagementTargetPath('PLAN', item.id) ?? '/plan';
    if (item.scheduledAt) {
      if (dayKey(item.scheduledAt) !== today) continue;
      tiles.push({
        key: `today:${item.id}`,
        ids: [],
        path,
        tone: 'brand',
        art: 'today',
        kind: t('wirNotices.kinds.today'),
        title: item.titleOrText.trim(),
        line: t('wirNotices.lines.plan'),
        time: time.format(item.scheduledAt),
      });
      continue;
    }
    const start = item.scheduledOn ?? item.occurredOn;
    if (!start) continue;
    const end = item.scheduledUntil ?? start;
    if (dayKey(start, 'UTC') > today || dayKey(end, 'UTC') < today) continue;
    tiles.push({
      key: `today:${item.id}`,
      ids: [],
      path,
      tone: 'brand',
      art: 'today',
      kind: t('wirNotices.kinds.today'),
      title: item.titleOrText.trim(),
      line: t('wirNotices.lines.allDay'),
    });
  }
  return tiles;
}

function reactionSymbol(code: string | null | undefined): string | undefined {
  return PHOTO_REACTIONS.find((reaction) => reaction.value === code)?.emoji;
}

/** One tile per notice; comments and reactions fold into the newest one. */
export function noticeTiles(
  notices: readonly WirNotice[],
  t: TranslateText,
  locale: string,
): Tile[] {
  const tiles: Tile[] = [];
  let folded: Tile | null = null;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  for (const notice of notices) {
    const title = notice.target?.title?.trim() || null;
    const path = notificationPath(notice) ?? MORE_NOTIFICATIONS_ROUTE;
    const base = { key: notice.id, ids: [notice.id], path };
    if (FOLDED_KINDS.has(notice.kind)) {
      if (folded) {
        folded.ids.push(notice.id);
        continue;
      }
      const isComment = notice.kind === 'COMMENT_CREATED';
      folded = {
        ...base,
        tone: 'deep-cool',
        art: isComment && notice.preview?.text ? 'bubble' : 'reaction',
        kind: t(
          isComment ? 'wirNotices.kinds.comment' : 'wirNotices.kinds.reaction',
        ),
        title: title ?? t('wirNotices.titles.moment'),
        line: title
          ? t('wirNotices.lines.on', { title })
          : t('wirNotices.titles.moment'),
        quote: isComment ? (notice.preview?.text ?? undefined) : undefined,
        reaction: isComment
          ? undefined
          : reactionSymbol(notice.preview?.reaction),
      };
      tiles.push(folded);
      continue;
    }
    switch (notice.kind) {
      case 'WISH_DATE_PROPOSED':
      case 'WISH_DATE_COUNTERED': {
        const start = notice.appointmentStart ?? null;
        tiles.push({
          ...base,
          tone: 'warm',
          art: 'date',
          kind: t(
            notice.kind === 'WISH_DATE_COUNTERED'
              ? 'wirNotices.kinds.counter'
              : 'wirNotices.kinds.date',
          ),
          title: title ?? t('wirNotices.titles.wish'),
          line: t('wirNotices.lines.date'),
          weekday: start ? weekday.format(start) : undefined,
          day: start ? day.format(start) : undefined,
          time: start ? time.format(start) : undefined,
        });
        break;
      }
      case 'WISH_SELECTION_SHARED':
      case 'WISH_SELECTION_READY':
      case 'WISH_SELECTION_RANDOM_REQUESTED':
        tiles.push({
          ...base,
          tone: 'warm',
          art: 'selection',
          kind: t('wirNotices.kinds.selection'),
          title: title ?? t('wirNotices.titles.selection'),
          line:
            notice.kind === 'WISH_SELECTION_READY'
              ? t('wirNotices.lines.selectionReady')
              : notice.kind === 'WISH_SELECTION_RANDOM_REQUESTED'
                ? t('wirNotices.lines.selectionRandom')
                : notice.selectionSize
                  ? t('wirNotices.lines.selectionShared', {
                      count: notice.selectionSize,
                    })
                  : t('wirNotices.lines.selectionShared'),
        });
        break;
      case 'COLLECTION_SENT': {
        // The small circle shows one entry; the rest joins the count.
        const previewItems = notice.preview?.items ?? [];
        const items = previewItems.slice(0, LIST_PREVIEW_ITEMS);
        const more =
          (notice.preview?.moreItems ?? 0) + previewItems.length - items.length;
        tiles.push({
          ...base,
          tone: 'cool',
          art: 'list',
          kind: t('wirNotices.kinds.list'),
          title: title ?? t('wirNotices.titles.list'),
          line: t('wirNotices.lines.shared'),
          items,
          moreCount: more,
          moreItems:
            more > 0
              ? t('wirNotices.lines.moreItems', { count: more })
              : undefined,
        });
        break;
      }
      case 'SHARED_NOTE_CREATED':
        tiles.push({
          ...base,
          tone: 'paper',
          art: 'note',
          kind: t('wirNotices.kinds.note'),
          title: title ?? t('wirNotices.titles.note'),
          line: t('wirNotices.lines.shared'),
          quote: notice.preview?.text ?? undefined,
        });
        break;
      case 'PICTURE_PING_PONG_FINISHED':
        tiles.push({
          ...base,
          tone: 'cool',
          art: 'picture',
          kind: t('wirNotices.kinds.picture'),
          title: t('wirNotices.titles.picture'),
          line: t('wirNotices.lines.picture'),
        });
        break;
      case 'HEART_HUNT_FOUND':
        tiles.push({
          ...base,
          tone: 'deep-warm',
          art: 'heart',
          kind: t('wirNotices.kinds.heart'),
          title: t('wirNotices.titles.heart'),
          line: t('wirNotices.lines.heart'),
        });
        break;
      default:
        break;
    }
  }
  if (folded && folded.ids.length > 1)
    folded.line = `${folded.line} · ${t('wirNotices.lines.more', {
      count: folded.ids.length - 1,
    })}`;
  return tiles;
}

/**
 * The `wirNotices` reel (#2345 B): today's plans first, then what is new, newest
 * first, as one swipeable reel of small circles that show real content (Product
 * Owner 2026-11-27). Opening a circle
 * marks its notices read, so they leave Wir, the inbox, the badge and every
 * device tray. It renders nothing while nothing is new and nothing is planned
 * today, and nothing at all while hidden in Settings.
 */
export function WirNewForYouModule({
  notificationsApi,
  accountId,
  spaceId,
  upcoming,
  viewerLocalDate,
  visible,
}: {
  notificationsApi: Pick<
    NotificationsApi,
    'getWirNotices' | 'markNotificationRead' | 'getNotificationUnreadCount'
  >;
  accountId: string;
  spaceId: string;
  upcoming: readonly DashboardItem[];
  viewerLocalDate: Date | null | undefined;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const headingId = useId();
  const locale = resolvedLocale();
  // The shell's unread count (same key, same read): Wir notices are unread
  // notices, so while it is zero there is nothing to ask for.
  const unread = useQuery({
    queryKey: notificationUnreadCountQueryKey(spaceId),
    queryFn: () => notificationsApi.getNotificationUnreadCount({ spaceId }),
    enabled: visible,
    staleTime: 30_000,
  });
  const unreadCount = unread.data?.unreadCount ?? 0;
  const query = useQuery({
    queryKey: wirNoticesQueryKey(spaceId),
    queryFn: async ({ signal }) => {
      try {
        return await notificationsApi.getWirNotices({ spaceId }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: visible && unreadCount > 0,
  });
  // A changed count (a poll, a push, a read elsewhere) reads the tiles again.
  useEffect(() => {
    if (visible && unreadCount > 0)
      void queryClient.invalidateQueries({
        queryKey: wirNoticesQueryKey(spaceId),
      });
  }, [queryClient, spaceId, unreadCount, visible]);
  const notices = useMemo(
    () => (unreadCount > 0 ? (query.data?.items ?? []) : []),
    [unreadCount, query.data],
  );
  const tiles = useMemo(
    () => [
      ...todayPlanTiles(upcoming, viewerLocalDate, t, locale),
      ...noticeTiles(notices, t, locale),
    ],
    [upcoming, viewerLocalDate, notices, t, locale],
  );
  const arrivals = useCardArrivals(
    `${accountId}:${spaceId}:notices`,
    tiles.map((tile) => tile.key),
  );
  if (!visible || tiles.length === 0) return null;

  const open = (tile: Tile) => {
    if (tile.ids.length === 0) return;
    const read = new Set(tile.ids);
    // Leaves Wir at once; the server read follows and refreshes the rest.
    queryClient.setQueryData<WirNotices>(wirNoticesQueryKey(spaceId), (data) =>
      data
        ? { ...data, items: data.items.filter((item) => !read.has(item.id)) }
        : data,
    );
    void Promise.allSettled(
      tile.ids.map((notificationId) =>
        notificationsApi.markNotificationRead({ spaceId, notificationId }),
      ),
    ).then(() =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: notificationUnreadCountQueryKey(spaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: notificationsListQueryKey(spaceId),
        }),
      ]),
    );
  };

  return (
    <section
      className="today-section today-section-new-for-you"
      aria-labelledby={headingId}
    >
      <div className="today-section-header">
        <h2 id={headingId} className="today-section-title">
          {t('wirNotices.title')}
        </h2>
      </div>
      <ul className="wir-lists-row wir-tile-reel wir-notice-tiles">
        {tiles.map((tile) => (
          <li
            key={tile.key}
            className={`wir-notice-item${cardArrivalClass(arrivals.get(tile.key))}`}
          >
            <TodayDestinationLink
              to={tile.path}
              className={`wir-notice-tile wir-notice-tone-${tile.tone}`}
              selectedKey={`wir-notice-${tile.key}`}
              onFollow={() => open(tile)}
            >
              <span className="wir-notice-face" aria-hidden="true">
                <TileFace tile={tile} />
              </span>
              <span className="wir-notice-label">{tile.title}</span>
              <span className="sr-only">
                {[tile.kind, tile.quote, tile.line, tile.moreItems]
                  .filter(Boolean)
                  .join(': ')}
              </span>
            </TodayDestinationLink>
          </li>
        ))}
        <li className="wir-notice-item">
          <TodayDestinationLink
            to={MORE_NOTIFICATIONS_ROUTE}
            className="wir-notice-tile wir-notice-tone-all"
            selectedKey="wir-notice-all"
          >
            <span className="wir-notice-face" aria-hidden="true">
              <svg
                className="wir-notice-dots"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                <circle cx="6" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="18" cy="12" r="2" />
              </svg>
            </span>
            <span className="wir-notice-label">{t('wirNotices.all')}</span>
            <span className="sr-only">{t('wirNotices.allLine')}</span>
          </TodayDestinationLink>
        </li>
      </ul>
    </section>
  );
}

/**
 * What a circle shows: a real piece of the content, never only a symbol
 * (Product Owner 2026-11-27). Decorative; the link reads the full text.
 */
function TileFace({ tile }: { tile: Tile }) {
  switch (tile.art) {
    case 'today':
      return tile.time ? (
        <span className="wir-notice-face-time">{tile.time}</span>
      ) : (
        <span className="wir-notice-face-word">{tile.kind}</span>
      );
    case 'date':
      return tile.day ? (
        <span className="wir-notice-leaf">
          <span className="wir-notice-leaf-weekday">{tile.weekday}</span>
          <span className="wir-notice-leaf-day">{tile.day}</span>
        </span>
      ) : (
        <span className="wir-notice-face-word">{tile.kind}</span>
      );
    case 'list':
      return (
        <span className="wir-notice-paper">
          {tile.items?.map((item) => (
            <span key={item} className="wir-notice-check">
              <span className="wir-notice-box" />
              <span className="wir-notice-check-text">{item}</span>
            </span>
          ))}
          {tile.moreCount ? (
            <span className="wir-notice-more">{`+${tile.moreCount}`}</span>
          ) : null}
        </span>
      );
    case 'note':
      return tile.quote ? (
        <span className="wir-notice-paper wir-notice-paper-note">
          {tile.quote}
        </span>
      ) : (
        <span className="wir-notice-face-word">{tile.kind}</span>
      );
    case 'bubble':
      return <span className="wir-notice-bubble">{tile.quote}</span>;
    case 'reaction':
      return tile.reaction ? (
        <span className="wir-notice-reaction">{tile.reaction}</span>
      ) : (
        <span className="wir-notice-face-word">{tile.kind}</span>
      );
    case 'heart':
      return (
        <svg
          aria-hidden="true"
          className="wir-notice-heart"
          viewBox="0 0 24 24"
          focusable="false"
        >
          <path d="M12 20.5s-8-4.9-8-10.6A4.5 4.5 0 0 1 12 7.3a4.5 4.5 0 0 1 8 2.6c0 5.7-8 10.6-8 10.6z" />
        </svg>
      );
    case 'picture':
      return (
        <svg
          className="wir-notice-canvas"
          viewBox="0 0 104 64"
          focusable="false"
          aria-hidden="true"
        >
          <path
            className="wir-notice-stroke-cool"
            d="M12 46c10-24 22-28 28-13s13 17 21 2"
          />
          <path
            className="wir-notice-stroke-accent"
            d="M58 37c6-15 15-22 25-18s8 17-2 23"
          />
        </svg>
      );
    case 'selection':
      return (
        <svg
          aria-hidden="true"
          className="wir-notice-cards"
          viewBox="0 0 40 40"
          focusable="false"
        >
          <rect x="6" y="10" width="18" height="24" rx="4" />
          <rect x="16" y="6" width="18" height="24" rx="4" />
        </svg>
      );
    default:
      return <span className="wir-notice-face-word">{tile.kind}</span>;
  }
}
