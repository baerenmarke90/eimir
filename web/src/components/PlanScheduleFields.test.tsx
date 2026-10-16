import { i18n } from '../i18n';
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlanScheduleFields } from './PlanScheduleFields';

describe('PlanScheduleFields', () => {
  afterEach(() => {
    cleanup();
  });

  it('clearing time preserves the chosen day, while clearing the day clears and disables wall-clock fields', () => {
    const { container } = render(
      <form>
        <PlanScheduleFields
          idPrefix="plan-schedule-test"
          defaultDate="2026-09-05"
          defaultTime="10:00"
          defaultEnd="2026-09-05T11:00"
          includeEnd
        />
      </form>,
    );

    const dateInput = container.querySelector(
      '#plan-schedule-test-date',
    ) as HTMLInputElement;
    const timeInput = container.querySelector(
      '#plan-schedule-test-time',
    ) as HTMLInputElement;
    const endTimeInput = container.querySelector(
      '#plan-schedule-test-end-time',
    ) as HTMLInputElement;
    const endInput = container.querySelector(
      '[name="plannedEnd"]',
    ) as HTMLInputElement;

    expect(dateInput.value).toBe('2026-09-05');
    expect(timeInput.value).toBe('10:00');
    expect(endTimeInput.value).toBe('11:00');
    expect(endInput.value).toBe('2026-09-05T11:00');

    fireEvent.change(timeInput, { target: { value: '' } });

    expect(dateInput.value).toBe('2026-09-05');
    expect(timeInput.value).toBe('');
    expect(container.querySelector('[name="plannedEnd"]')).toBeNull();

    fireEvent.change(timeInput, { target: { value: '09:30' } });
    expect(timeInput.disabled).toBe(false);
    expect(container.textContent).toContain('+ Endzeit hinzufügen');

    fireEvent.change(dateInput, { target: { value: '' } });

    expect(dateInput.value).toBe('');
    expect(timeInput.value).toBe('');
    expect(timeInput.disabled).toBe(true);
    expect(container.querySelector('[name="plannedEnd"]')).toBeNull();
  });

  it('discloses a same-day end time, validates the range, and supports an explicit next-day end', () => {
    const { container } = render(
      <form>
        <PlanScheduleFields
          idPrefix="plan-progressive-end"
          defaultDate="2026-09-05"
          defaultTime="10:00"
          includeEnd
        />
      </form>,
    );

    expect(
      container
        .querySelector('#plan-progressive-end-end-time')
        ?.closest('[hidden]'),
    ).not.toBeNull();
    const disclosure = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Endzeit hinzufügen'),
    ) as HTMLButtonElement;
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(disclosure);
    const endTime = container.querySelector(
      '#plan-progressive-end-end-time',
    ) as HTMLInputElement;
    const plannedEnd = container.querySelector(
      '[name="plannedEnd"]',
    ) as HTMLInputElement;
    expect(endTime).not.toBeNull();

    fireEvent.change(endTime, { target: { value: '09:30' } });
    expect(plannedEnd.value).toBe('2026-09-05T09:30');
    expect(endTime.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain(
      i18n.t('m5s3.plan.endMustFollowStart'),
    );

    const crossDay = container.querySelector(
      '.planning-schedule-cross-day input',
    ) as HTMLInputElement;
    fireEvent.click(crossDay);
    const endDate = container.querySelector(
      '#plan-progressive-end-end-date',
    ) as HTMLInputElement;
    fireEvent.change(endDate, { target: { value: '2026-09-06' } });

    expect(plannedEnd.value).toBe('2026-09-06T09:30');
    expect(endTime.hasAttribute('aria-invalid')).toBe(false);
  });
});
