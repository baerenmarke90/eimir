import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { resolvedLocale, useTranslation } from '../i18n';
import './PlanDateCalendar.css';

/** ISO calendar date (`YYYY-MM-DD`) without time zone. */
type IsoDate = string;

function parseIso(value: IsoDate): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toIso(date: Date): IsoDate {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday-first cells for one month; `null` pads the first and last week. */
export function monthCells(
  year: number,
  month: number,
): { key: string; date: Date | null }[] {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  const cells: { key: string; date: Date | null }[] = Array.from(
    { length: leading },
    (_, slot) => ({ key: `lead-${slot}`, date: null }),
  );
  for (let day = 1; day <= length; day += 1) {
    const date = new Date(year, month, day);
    cells.push({ key: toIso(date), date });
  }
  for (let slot = 0; cells.length % 7 !== 0; slot += 1)
    cells.push({ key: `trail-${slot}`, date: null });
  return cells;
}

/**
 * The in-app month calendar of the Plan schedule sheet (#2063, Product Owner
 * 2026-11-19). It replaces the platform date dialog on phones with a calm,
 * app-styled grid: Monday first, today outlined, the chosen day filled. Every
 * day is a native button with its full localized date as accessible name;
 * arrow keys move by day and week, and the grid follows into other months.
 */
export function PlanDateCalendar({
  value,
  onChange,
  disabled = false,
  today = new Date(),
}: {
  value: IsoDate;
  onChange: (next: IsoDate) => void;
  disabled?: boolean;
  today?: Date;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const headingId = useId();
  const selected = parseIso(value);
  const [visible, setVisible] = useState(() => {
    const anchor = selected ?? today;
    return { year: anchor.getFullYear(), month: anchor.getMonth() };
  });
  const [focusDay, setFocusDay] = useState<IsoDate>(value || toIso(today));
  const grid = useRef<HTMLFieldSetElement>(null);
  const pendingFocus = useRef<IsoDate | null>(null);
  const cells = useMemo(
    () => monthCells(visible.year, visible.month),
    [visible],
  );
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(visible.year, visible.month, 1));
  const dayLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, index) =>
      format.format(new Date(2024, 0, 1 + index)).replace(/\.$/, ''),
    );
  }, [locale]);
  const todayIso = toIso(today);
  const visibleIsos = new Set(
    cells.flatMap((cell) => (cell.date ? [toIso(cell.date)] : [])),
  );
  const tabbable = visibleIsos.has(focusDay)
    ? focusDay
    : value && visibleIsos.has(value)
      ? value
      : visibleIsos.has(todayIso)
        ? todayIso
        : toIso(new Date(visible.year, visible.month, 1));

  function showMonth(offset: number) {
    setVisible((current) => {
      const next = new Date(current.year, current.month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function moveFocus(from: IsoDate, days: number) {
    const start = parseIso(from);
    if (!start) return;
    const next = addDays(start, days);
    pendingFocus.current = toIso(next);
    setFocusDay(toIso(next));
    setVisible({ year: next.getFullYear(), month: next.getMonth() });
  }

  // Keyboard focus follows once the grid shows the target day.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${target}"]`)
      ?.focus();
  });

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, iso: IsoDate) {
    const step = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    moveFocus(iso, step);
  }

  return (
    <div className="plan-date-calendar">
      <div className="plan-date-calendar-header">
        <button
          type="button"
          className="plan-date-calendar-nav"
          aria-label={t('m5s3.plan.calendarPrevious')}
          disabled={disabled}
          onClick={() => showMonth(-1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <strong id={headingId} aria-live="polite">
          {monthLabel}
        </strong>
        <button
          type="button"
          className="plan-date-calendar-nav"
          aria-label={t('m5s3.plan.calendarNext')}
          disabled={disabled}
          onClick={() => showMonth(1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <fieldset
        ref={grid}
        className="plan-date-calendar-grid"
        aria-labelledby={headingId}
      >
        {weekdays.map((weekday) => (
          <span
            key={weekday}
            className="plan-date-calendar-weekday"
            aria-hidden="true"
          >
            {weekday}
          </span>
        ))}
        {cells.map(({ key, date: cell }) => {
          if (!cell)
            return (
              <span
                key={key}
                className="plan-date-calendar-pad"
                aria-hidden="true"
              />
            );
          const iso = key;
          const isSelected = iso === value;
          return (
            <button
              key={iso}
              type="button"
              data-day={iso}
              className={`plan-date-calendar-day${isSelected ? ' is-selected' : ''}${iso === todayIso ? ' is-today' : ''}`}
              aria-pressed={isSelected}
              aria-label={dayLabel.format(cell)}
              aria-current={iso === todayIso ? 'date' : undefined}
              tabIndex={iso === tabbable ? 0 : -1}
              disabled={disabled}
              onClick={() => {
                setFocusDay(iso);
                onChange(iso);
              }}
              onKeyDown={(event) => onKeyDown(event, iso)}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
