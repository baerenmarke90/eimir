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
