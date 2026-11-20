// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import m5s3 from '../i18n/locales/m5s3';
import { monthCells, PlanDateCalendar } from './PlanDateCalendar';

afterEach(cleanup);

it('lays a month out Monday first with padding to full weeks', () => {
  // December 2026 starts on a Tuesday and has 31 days.
  const cells = monthCells(2026, 11);
  expect(cells).toHaveLength(35);
  expect(cells[0].date).toBeNull();
  expect(cells[1].date?.getDate()).toBe(1);
  expect(cells[31].date?.getDate()).toBe(31);
  expect(cells.slice(32).every((cell) => cell.date === null)).toBe(true);
  expect(new Set(cells.map((cell) => cell.key)).size).toBe(cells.length);
});

it('picks a day, marks the selection and pages between months', () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <PlanDateCalendar
      value=""
      onChange={onChange}
      today={new Date(2026, 10, 19)}
    />,
  );
  const days = () =>
    screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('data-day'));
  expect(days()).toHaveLength(30);
  const today = days().find(
    (button) => button.getAttribute('aria-current') === 'date',
  );
  expect(today?.getAttribute('data-day')).toBe('2026-11-19');
  expect(today?.tabIndex).toBe(0);

  fireEvent.click(days()[4]);
  expect(onChange).toHaveBeenCalledWith('2026-11-05');
  rerender(
    <PlanDateCalendar
      value="2026-11-05"
      onChange={onChange}
      today={new Date(2026, 10, 19)}
    />,
  );
  expect(days()[4].getAttribute('aria-pressed')).toBe('true');

  fireEvent.click(screen.getByRole('button', { name: m5s3.plan.calendarNext }));
  expect(days()[0].getAttribute('data-day')).toBe('2026-12-01');
  fireEvent.click(
    screen.getByRole('button', { name: m5s3.plan.calendarPrevious }),
  );
  expect(days()[0].getAttribute('data-day')).toBe('2026-11-01');
});

it('moves through days with the arrow keys, across month borders', () => {
  render(
    <PlanDateCalendar
      value="2026-11-30"
      onChange={() => undefined}
      today={new Date(2026, 10, 19)}
    />,
  );
  const selected = screen.getByRole('button', { pressed: true });
  fireEvent.keyDown(selected, { key: 'ArrowRight' });
  const moved = document.activeElement as HTMLElement;
  expect(moved.getAttribute('data-day')).toBe('2026-12-01');
  expect(moved.tabIndex).toBe(0);
});
