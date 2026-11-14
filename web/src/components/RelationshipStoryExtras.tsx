import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChaptersApi } from '../api/generated/apis/ChaptersApi';
import { PeopleApi } from '../api/generated/apis/PeopleApi';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import { WishesApi } from '../api/generated/apis/WishesApi';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { Configuration } from '../client/apiConfiguration';
import { calculateNextAnniversary } from '../client/relationshipPreview';
import { chapterDetailPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { AppErrorBoundary } from './AppErrorBoundary';
import type { MapLocation } from './PlaceMapCanvas';

/*
 * Further facts for the "Eure Geschichte" information page, read
 * from what the product already knows. Every read is optional: a failed or
 * empty one simply leaves its part of the page out.
 */

const MapCanvas = lazy(() => import('./PlaceMapCanvas'));

const PAGE_LIMIT = 100;
/** A hard stop so a faulty cursor can never loop forever. */
const MAX_PAGES = 30;
const DAY_MS = 86_400_000;

/** Reads every page, so counts and the map are complete rather than capped. */
async function readAllPages<T>(
  load: (cursor: string | null) => Promise<{
    items: T[];
    nextCursor?: string | null;
  }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await load(cursor);
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return items;
}

interface StoryScope {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}

function useStoryApis({ apiBaseUrl, accessToken }: StoryScope) {
  return useMemo(() => {
    const configuration = new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      chapters: new ChaptersApi(configuration),
      people: new PeopleApi(configuration),
      places: new PlacesApi(configuration),
      wishes: new WishesApi(configuration),
    };
  }, [apiBaseUrl, accessToken]);
}

export interface StoryOccasion {
  key: string;
  label: string;
  date: Date;
  daysRemaining: number;
}

/** The couple's own upcoming occasions, nearest first. Holidays are not theirs. */
export function useStoryOccasions(
  scope: StoryScope,
  partnerBirthday: { name: string; date: Date | null | undefined } | null,
): StoryOccasion[] {
  const { t } = useTranslation();
  const apis = useStoryApis(scope);
  const dates = useQuery({
    queryKey: ['story-overview', 'occasions', scope.accountId, scope.spaceId],
    queryFn: () =>
      apis.people.listImportantDatesApiV1SpacesSpaceIdImportantDatesGet({
        spaceId: scope.spaceId,
      }),
    retry: false,
  });
  return useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const upcoming: StoryOccasion[] = [];
    const add = (key: string, label: string, date: Date, annual: boolean) => {
      const next = annual
        ? calculateNextAnniversary(date, today)?.nextDate
        : date;
      if (!next || next.getTime() < today.getTime()) return;
      upcoming.push({
        key,
        label,
        date: next,
        daysRemaining: Math.round((next.getTime() - today.getTime()) / DAY_MS),
      });
    };
    for (const entry of dates.data ?? [])
      add(
        entry.id,
        entry.label,
        entry.date,
        entry.repeats === DateRepeat.ANNUALLY,
      );
    if (partnerBirthday?.date)
      add(
        'partner-birthday',
        t('importantDates.partnerBirthdayLabel', {
          name: partnerBirthday.name,
        }),
        partnerBirthday.date,
        true,
      );
    const seen = new Set<string>();
    return upcoming
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .filter((entry) => {
        const id = `${entry.label}:${entry.date.getTime()}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 3);
  }, [dates.data, partnerBirthday?.date, partnerBirthday?.name, t]);
}

/** Fulfilled wishes, counted across all pages. */
export function useFulfilledWishes(scope: StoryScope) {
  const apis = useStoryApis(scope);
  const wishes = useQuery({
    queryKey: ['story-overview', 'wishes', scope.accountId, scope.spaceId],
    queryFn: () =>
      readAllPages((cursor) =>
        apis.wishes.listWishes({
          spaceId: scope.spaceId,
          cursor,
          limit: PAGE_LIMIT,
          status: 'COMPLETED',
        }),
      ),
    retry: false,
  });
  return wishes.data ? { count: wishes.data.length } : null;
}

/** The couple's places: a small map and the place they return to most. */
export function StoryPlaces(scope: StoryScope) {
  const { t } = useTranslation();
  const apis = useStoryApis(scope);
  const map = useQuery({
    queryKey: ['story-overview', 'places', scope.accountId, scope.spaceId],
    queryFn: () =>
      readAllPages((cursor) =>
        apis.places.listMemoryMap({
          spaceId: scope.spaceId,
          cursor,
          limit: PAGE_LIMIT,
        }),
      ),
    retry: false,
  });
  const locations = useMemo(() => {
    const grouped = new Map<string, MapLocation & { memories: Set<string> }>();
    for (const entry of map.data ?? []) {
      const id = `${entry.latitude}:${entry.longitude}`;
      const group = grouped.get(id) ?? {
        id,
        latitude: entry.latitude,
        longitude: entry.longitude,
        label: entry.placeName,
        count: 0,
        memories: new Set<string>(),
      };
      group.memories.add(entry.memoryId);
      group.count = group.memories.size;
      grouped.set(id, group);
    }
    return [...grouped.values()];
  }, [map.data]);
  if (!locations.length) return null;
  const top = locations.reduce((best, place) =>
    place.count > best.count ? place : best,
  );
  // Frame where most places are instead of the full span: the median centre
  // ignores a single far-away trip that would push everything to the edge.
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const centre = {
    latitude: median(locations.map((place) => place.latitude)),
    longitude: median(locations.map((place) => place.longitude)),
  };
  const spread = Math.max(
    0.05,
    median(
      locations.map((place) =>
        Math.max(
          Math.abs(place.latitude - centre.latitude),
          Math.abs(place.longitude - centre.longitude),
        ),
      ),
    ),
  );
  // Roughly: one zoom level halves the visible span; 360 degrees at zoom 0.
  const zoom = Math.min(11, Math.max(3, Math.log2(360 / (spread * 6))));
  return (
    <div className="passport-places">
      <h3>{t('relationshipReflections.passport.placesTitle')}</h3>
      <Link
        className="passport-places-map"
        to="/story/map"
        aria-label={t('memoryMap.title')}
      >
        <AppErrorBoundary
          resetKey={`${scope.spaceId}:${scope.accountId}:story`}
          fallback={null}
        >
          <Suspense fallback={<span className="passport-places-loading" />}>
            <MapCanvas
              locations={locations}
              initialViewport={{ ...centre, zoom }}
              ariaLabel={t('memoryMap.title')}
            />
          </Suspense>
        </AppErrorBoundary>
      </Link>
      {top.count > 1 ? (
        <p className="passport-places-top">
          {t('relationshipReflections.passport.topPlace', {
            place: top.label,
          })}
          <span>{t('memoryMap.memoryCount', { count: top.count })}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Chapters as spans on the same axis as the story: from its start to today. */
export function StoryChapters({
  startedOn,
  ...scope
}: StoryScope & { startedOn: Date | null | undefined }) {
  const { t } = useTranslation();
  const apis = useStoryApis(scope);
  const chapters = useQuery({
    queryKey: ['story-overview', 'chapters', scope.accountId, scope.spaceId],
    queryFn: () =>
      apis.chapters.listChapters({ spaceId: scope.spaceId, limit: 50 }),
    retry: false,
  });
  const rows = useMemo(() => {
    const dated = (chapters.data?.items ?? []).flatMap((chapter) =>
      chapter.startOn ? [{ ...chapter, startOn: chapter.startOn }] : [],
    );
    if (!dated.length) return [];
    const now = Date.now();
    const origin = Math.min(
      startedOn && Number.isFinite(startedOn.getTime())
        ? startedOn.getTime()
        : now,
      ...dated.map((chapter) => chapter.startOn.getTime()),
    );
    const span = Math.max(DAY_MS, now - origin);
    const format = new Intl.DateTimeFormat(resolvedLocale(), {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return dated
      .sort((a, b) => a.startOn.getTime() - b.startOn.getTime())
      .map((chapter) => {
        const start = Math.max(origin, chapter.startOn.getTime());
        const end = Math.min(now, chapter.endOn?.getTime() ?? now);
        return {
          id: chapter.id,
          title: chapter.title,
          range: chapter.endOn
            ? `${format.format(chapter.startOn)} – ${format.format(chapter.endOn)}`
            : format.format(chapter.startOn),
          from: (start - origin) / span,
          // A short chapter still needs a visible mark on the axis.
          width: Math.max(0.03, (Math.max(end, start) - start) / span),
        };
      });
  }, [chapters.data, startedOn]);
  if (!rows.length) return null;
  return (
    <div className="passport-chapters">
      <h4>{t('relationshipReflections.passport.chaptersTitle')}</h4>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <Link to={chapterDetailPath(row.id)}>
              <span className="passport-chapter-title">{row.title}</span>
              <span className="passport-chapter-range">{row.range}</span>
              <span
                className="passport-chapter-track"
                aria-hidden="true"
                style={{
                  ['--passport-from' as string]: String(
                    Math.min(row.from, 1 - row.width),
                  ),
                  ['--passport-width' as string]: String(row.width),
                }}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
