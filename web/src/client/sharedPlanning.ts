import { ChapterRelationsApi } from '../api/generated/apis/ChapterRelationsApi';
import { ChaptersApi } from '../api/generated/apis/ChaptersApi';
import { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import { HeartMomentsApi } from '../api/generated/apis/HeartMomentsApi';
import { i18n } from '../i18n';
import { MemoriesApi } from '../api/generated/apis/MemoriesApi';
import { MilestonesApi } from '../api/generated/apis/MilestonesApi';
import { PlaceRelationsApi } from '../api/generated/apis/PlaceRelationsApi';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import { PlansApi } from '../api/generated/apis/PlansApi';
import { StoryApi } from '../api/generated/apis/StoryApi';
import { WishesApi } from '../api/generated/apis/WishesApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { Configuration } from '../api/generated/runtime';

export interface SharedPlanningApis {
  wishes: WishesApi;
  plans: PlansApi;
  places: PlacesApi;
  placeRelations: PlaceRelationsApi;
  chapters: ChaptersApi;
  chapterRelations: ChapterRelationsApi;
  collections: CollectionsApi;
  story: StoryApi;
  memories: MemoriesApi;
  heartMoments: HeartMomentsApi;
  milestones: MilestonesApi;
}

export interface VersionedResource {
  version: number;
}

export type PlanningRelationKind = 'MEMORY' | 'HEART_MOMENT' | 'MILESTONE';

export interface PlanningRelationTarget {
  id: string;
  kind: PlanningRelationKind;
  label: string;
  effectiveDate: Date;
}

export function createSharedPlanningApis(
  apiBaseUrl: string,
  accessToken: string,
): SharedPlanningApis {
  const configuration = new Configuration({
    basePath: apiBaseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return {
    wishes: new WishesApi(configuration),
    plans: new PlansApi(configuration),
    places: new PlacesApi(configuration),
    placeRelations: new PlaceRelationsApi(configuration),
    chapters: new ChaptersApi(configuration),
    chapterRelations: new ChapterRelationsApi(configuration),
    collections: new CollectionsApi(configuration),
    story: new StoryApi(configuration),
    memories: new MemoriesApi(configuration),
    heartMoments: new HeartMomentsApi(configuration),
    milestones: new MilestonesApi(configuration),
  };
}

export function planningIfMatch(resource: VersionedResource): string {
  return String(resource.version);
}

/** OpenAPI `date` transport value, encoded at UTC midnight only for JSON I/O. */
export function dateOnlyInput(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

/**
 * Convert an HTML date value to the generated client's OpenAPI `date` carrier.
 *
 * The generated TypeScript client represents `format: date` as `Date` and
 * serializes only its UTC YYYY-MM-DD prefix. This value must never be treated
 * as an instant for product presentation.
 */
export function dateFromInput(value: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00Z`) : undefined;
}

export function localDateTimeInput(value: Date | null | undefined): string {
  if (!value) return '';
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function dateTimeFromInput(value: string): Date | undefined {
  return value ? new Date(value) : undefined;
}

/** Browser-local YYYY-MM-DD without passing through UTC conversion. */
export function localCalendarDateInput(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Build the authoritative PlanSchedule transport from separate product inputs.
 * No date means no schedule. A date without time remains `plannedOn`; a chosen
 * time becomes a real local wall-clock instant and therefore `plannedStart`.
 */
export function planScheduleFromInputs(
  dateValue: string,
  timeValue: string,
  endValue = '',
): PlanSchedule | undefined {
  if (!dateValue) return undefined;

  if (!timeValue) {
    const plannedOn = dateFromInput(dateValue);
    return plannedOn ? { plannedOn } : undefined;
  }

  const plannedStart = dateTimeFromInput(`${dateValue}T${timeValue}`);
  if (!plannedStart) return undefined;
  const plannedEnd = dateTimeFromInput(endValue);
  return { plannedStart, plannedEnd };
}

/** Product date input for either explicit date-only or timed Plan schedules. */
export function planScheduleDateInput(
  plan: Pick<PlanDetail, 'plannedOn' | 'plannedStart'>,
): string {
  if (plan.plannedOn) return dateOnlyInput(plan.plannedOn);
  return localDateTimeInput(plan.plannedStart).slice(0, 10);
}

/** Product time input. Absence is semantically meaningful and must stay empty. */
export function planScheduleTimeInput(
  plan: Pick<PlanDetail, 'plannedStart'>,
): string {
  return localDateTimeInput(plan.plannedStart).slice(11, 16);
}

export async function loadAllPlaces(
  apis: Pick<SharedPlanningApis, 'places'>,
  spaceId: string,
): Promise<PlaceDetail[]> {
  const items: PlaceDetail[] = [];
  let cursor: string | null | undefined = null;
  const seenCursors = new Set<string>();

  do {
    const page = await apis.places.listPlaces({
      spaceId,
      cursor,
      limit: 50,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new Error('Place pagination returned a repeated cursor.');
      }
      seenCursors.add(cursor);
    }
  } while (cursor);

  return items;
}

export function moveItemIds(
  ids: readonly string[],
  index: number,
  direction: -1 | 1,
): string[] {
  const target = index + direction;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) {
    return [...ids];
  }
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function storyRelationTarget(item: StoryItem): PlanningRelationTarget {
  switch (item.kind) {
    case 'MEMORY':
      return {
        id: item.memory.id,
        kind: 'MEMORY',
        label: item.memory.title,
        effectiveDate: item.effectiveDate,
      };
    case 'HEART_MOMENT':
      return {
        id: item.heartMoment.id,
        kind: 'HEART_MOMENT',
        label: item.heartMoment.text || i18n.t('heartMomentProduct.untitled'),
        effectiveDate: item.effectiveDate,
      };
    case 'MILESTONE':
      return {
        id: item.milestone.id,
        kind: 'MILESTONE',
        label: item.milestone.title,
        effectiveDate: item.effectiveDate,
      };
  }
}
