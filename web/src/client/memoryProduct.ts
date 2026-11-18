import type { TFunction } from 'i18next';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { MemoryUpdate } from '../api/generated/models/MemoryUpdate';
import type { MemoryTag } from '../components/MemoryTagChoices';
import { resolvedLocale } from '../i18n';
import { formatDateInputValue, formatDateSummary } from './dateInput';

export interface MemoryEditValues {
  title: string;
  body: string;
  happenedOn: string;
  happenedUntil?: string;
  placeIds?: string[];
  expectedPlaceIds?: string[];
  tags: MemoryTag[];
}

export function memoryDateInputValue(value: Date | null): string {
  if (!value) return '';
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Share the creation/detail rule without treating authored text as metadata. */
export function isGeneratedMemoryTitle(
  title: string,
  happenedOn: Date | null,
  t: TFunction,
): boolean {
  return Boolean(
    happenedOn &&
      title.trim() ===
        t('memoryProduct.createFallbackTitle', {
          date: formatDateInputValue(
            memoryDateInputValue(happenedOn),
            resolvedLocale(),
          ),
        }),
  );
}

/** Date-only capture titles become one readable caption, never two dates. */
export function memoryPreviewTitle(
  title: string | null | undefined,
  date: Date | null | undefined,
  t: TFunction,
  through?: Date | null,
): { title: string; titleIsDate: boolean } {
  if (date && (!title?.trim() || isGeneratedMemoryTitle(title, date, t))) {
    return {
      title:
        through && through.getTime() !== date.getTime()
          ? new Intl.DateTimeFormat(resolvedLocale(), {
              dateStyle: 'medium',
              timeZone: 'UTC',
            }).formatRange(date, through)
          : formatDateSummary(memoryDateInputValue(date), resolvedLocale()),
      titleIsDate: true,
    };
  }
  return { title: title?.trim() || t('story.kind.memory'), titleIsDate: false };
}

export function memoryUpdatePayload(values: MemoryEditValues): MemoryUpdate {
  return {
    ...(values.happenedUntil !== undefined
      ? {
          happenedUntil: values.happenedUntil
            ? new Date(`${values.happenedUntil}T00:00:00.000Z`)
            : null,
        }
      : {}),
    ...(values.placeIds !== undefined
      ? {
          placeIds: values.placeIds,
          expectedPlaceIds: values.expectedPlaceIds ?? [],
        }
      : {}),
    title: values.title,
    body: values.body,
    tags: values.tags,
    happenedOn: values.happenedOn
      ? new Date(`${values.happenedOn}T00:00:00.000Z`)
      : null,
  };
}

export function memoryIfMatch(memory: Pick<MemoryDetail, 'version'>): string {
  return String(memory.version);
}
