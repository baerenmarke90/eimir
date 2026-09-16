import type { MouseEvent } from 'react';

export function localDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function effectiveDateInputValue(
  value: string,
  date: Date = new Date(),
): string {
  return value.trim() || localDateInputValue(date);
}

export function dateInputValueToApiDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid date input value: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid date input value: ${value}`);
  }
  return date;
}

export function formatDateInputValue(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(dateInputValueToApiDate(value));
}

/** Reader-friendly local date summary, e.g. "16. September 2026". */
export function formatDateSummary(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(dateInputValueToApiDate(value));
}

export function openNativeDatePicker(
  event: MouseEvent<HTMLInputElement>,
): void {
  const input = event.currentTarget;
  if (typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Some browsers reject showPicker() outside a trusted user gesture or
    // for a disabled/readonly input; the native click behavior still works.
  }
}
