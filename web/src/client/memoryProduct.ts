import type { TFunction } from 'i18next';
import { resolvedLocale } from '../i18n';
import { formatDateInputValue } from './dateInput';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { MemoryUpdate } from '../api/generated/models/MemoryUpdate';
import type { MemoryTag } from '../components/MemoryTagChoices';

export interface MemoryEditValues {
  title: string;
  body: string;
  happenedOn: string;
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

export function memoryUpdatePayload(values: MemoryEditValues): MemoryUpdate {
  return {
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
