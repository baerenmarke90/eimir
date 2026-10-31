import type { PlanDetail } from '../api/generated/models/PlanDetail';

type CalendarPlan = Pick<
  PlanDetail,
  | 'id'
  | 'spaceId'
  | 'title'
  | 'description'
  | 'plannedOn'
  | 'plannedStart'
  | 'plannedEnd'
  | 'updatedAt'
  | 'version'
>;

export interface PlanCalendarEvent {
  title: string;
  description?: string;
  location?: string;
  allDay: boolean;
  startTime: number;
  endTime?: number;
}

/** One schedule contract for the native editor and RFC 5545 export. */
export function planCalendarEvent(
  plan: CalendarPlan,
  location?: string,
): PlanCalendarEvent | null {
  const start = plan.plannedOn ?? plan.plannedStart;
  if (!start) return null;
  const allDay = Boolean(plan.plannedOn);
  const end = allDay ? new Date(start) : plan.plannedEnd;
  if (allDay) end?.setUTCDate(end.getUTCDate() + 1);
  return {
    title: plan.title,
    description: plan.description ?? undefined,
    location,
    allDay,
    startTime: start.getTime(),
    endTime: end?.getTime(),
  };
}

/** RFC 5545 TEXT escaping prevents content from becoming calendar properties. */
function text(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Fold on Unicode boundaries, with at most 75 UTF-8 octets per physical line. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      result += '\r\n ';
      bytes = 1;
    }
    result += char;
    bytes += size;
  }
  return result;
}

function instant(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function planCalendar(
  plan: CalendarPlan,
  location?: string,
): string | null {
  const event = planCalendarEvent(plan, location);
  if (!event) return null;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//eimir.//Plans//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${text(plan.spaceId)}-${text(plan.id)}@eimir`,
    `DTSTAMP:${instant(plan.updatedAt)}`,
    `SEQUENCE:${plan.version}`,
    `SUMMARY:${text(plan.title)}`,
  ];
  if (event.allDay && event.endTime !== undefined) {
    // Generated DATE fields encode their calendar components in UTC.
    const start = instant(new Date(event.startTime)).slice(0, 8);
    const end = instant(new Date(event.endTime)).slice(0, 8);
    lines.push(`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`);
  } else {
    lines.push(`DTSTART:${instant(new Date(event.startTime))}`);
    if (event.endTime !== undefined)
      lines.push(`DTEND:${instant(new Date(event.endTime))}`);
  }
  if (plan.description) lines.push(`DESCRIPTION:${text(plan.description)}`);
  if (location) lines.push(`LOCATION:${text(location)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
