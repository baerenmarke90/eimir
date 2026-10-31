import type { PlanDetail } from '../api/generated/models/PlanDetail';

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
  plan: Pick<
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
  >,
  location?: string,
): string | null {
  if (!plan.plannedOn && !plan.plannedStart) return null;
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
  if (plan.plannedOn) {
    // Generated DATE fields encode their calendar components in UTC.
    const start = plan.plannedOn.toISOString().slice(0, 10).replace(/-/g, '');
    const end = new Date(plan.plannedOn);
    end.setUTCDate(end.getUTCDate() + 1);
    lines.push(
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`,
    );
  } else if (plan.plannedStart) {
    lines.push(`DTSTART:${instant(plan.plannedStart)}`);
    if (plan.plannedEnd) lines.push(`DTEND:${instant(plan.plannedEnd)}`);
  }
  if (plan.description) lines.push(`DESCRIPTION:${text(plan.description)}`);
  if (location) lines.push(`LOCATION:${text(location)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
