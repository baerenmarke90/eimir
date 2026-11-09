import { i18n } from '../i18n';
// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  PlanScheduleFields,
  type PlanScheduleFieldsHandle,
} from './PlanScheduleFields';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  window.history.replaceState(
    { key: 'schedule-test', idx: 0 },
    '',
    '/plan/plans/new',
  );
});

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
    const addEnd = screen.getByRole('button', {
      name: i18n.t('m5s3.plan.addEndTime'),
    });
    expect(addEnd.textContent).toBe(i18n.t('m5s3.plan.addEndTime'));
    expect(addEnd.querySelector('.eimir-icon-hinzufuegen')).not.toBeNull();

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

  function compactSchedule({
    disabled = false,
    defaultEnd = '2026-09-05T11:00',
  } = {}) {
    const handle = createRef<PlanScheduleFieldsHandle>();
    const view = render(
      <>
        <form id="compact-plan-form" />
        <PlanScheduleFields
          ref={handle}
          compact
          disabled={disabled}
          formId="compact-plan-form"
          idPrefix="compact-plan-schedule"
          defaultDate="2026-09-05"
          defaultTime="10:00"
          defaultEnd={defaultEnd}
          includeEnd
        />
      </>,
    );
    const form = view.container.querySelector('form') as HTMLFormElement;
    const data = () => new FormData(form);
    const open = () =>
      fireEvent.click(
        view.container.querySelector(
          '.composer-schedule-trigger',
        ) as HTMLButtonElement,
      );
    const done = async () => {
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('experiences.finish') }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    };
    return { ...view, handle, form, data, open, done };
  }

  it('keeps one authoritative value per schedule field in its external form while the compact sheet opens and closes', async () => {
    const { data, open, done } = compactSchedule();
    const expected = {
      plannedDate: '2026-09-05',
      plannedTime: '10:00',
      plannedEnd: '2026-09-05T11:00',
    };
    expect(Object.fromEntries(data())).toEqual(expected);
    expect(screen.queryByLabelText(i18n.t('m5s3.plan.plannedDate'))).toBeNull();
    open();
    const date = screen.getByLabelText(
      i18n.t('m5s3.plan.plannedDate'),
    ) as HTMLInputElement;
    expect(date.form?.id).toBe('compact-plan-form');
    expect(date.name).toBe('');
    expect(Object.fromEntries(data())).toEqual(expected);
    for (const name of Object.keys(expected))
      expect(data().getAll(name)).toHaveLength(1);
    fireEvent.change(date, { target: { value: '2026-09-06' } });
    await done();
    expect(data().get('plannedDate')).toBe('2026-09-06');
    expect(
      screen.getByRole('button', { name: /6\. Sept/ }).textContent,
    ).toContain('6. Sept');
    open();
    expect(
      (
        screen.getByLabelText(
          i18n.t('m5s3.plan.plannedDate'),
        ) as HTMLInputElement
      ).value,
    ).toBe('2026-09-06');
  });

  it('reveals and focuses an invalid closed end range, keeps Done blocked, and accepts an explicit next-day end', async () => {
    const { handle, open, done, data } = compactSchedule({
      defaultEnd: '2026-09-05T09:00',
    });
    let valid = true;
    act(() => {
      valid = handle.current?.reportValidity() ?? true;
    });
    expect(valid).toBe(false);
    const endTime = screen.getByLabelText(
      i18n.t('m5s3.plan.endTime'),
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(endTime);
    expect(endTime.validity.customError).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('experiences.finish') }),
    );
    expect(screen.getByRole('dialog')).not.toBeNull();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: i18n.t('m5s3.plan.endsAnotherDay'),
      }),
    );
    fireEvent.change(screen.getByLabelText(i18n.t('m5s3.plan.endDate')), {
      target: { value: '2026-09-06' },
    });
    await done();
    expect(data().get('plannedEnd')).toBe('2026-09-06T09:00');
    expect(handle.current?.reportValidity()).toBe(true);
    open();
    expect(
      (screen.getByLabelText(i18n.t('m5s3.plan.endTime')) as HTMLInputElement)
        .value,
    ).toBe('09:00');
  });

  it('reveals a required missing end date after a reversible dismissal without submitting an incomplete range', async () => {
    const { handle, open } = compactSchedule();
    open();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: i18n.t('m5s3.plan.endsAnotherDay'),
      }),
    );
    fireEvent.change(screen.getByLabelText(i18n.t('m5s3.plan.endDate')), {
      target: { value: '' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('taskSheets.close') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    let valid = true;
    act(() => {
      valid = handle.current?.reportValidity() ?? true;
    });
    expect(valid).toBe(false);
    const endDate = screen.getByLabelText(
      i18n.t('m5s3.plan.endDate'),
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(endDate);
    expect(endDate.validity.valueMissing).toBe(true);
  });

  it('restores the same default state on native form reset while compact controls are unmounted', async () => {
    const { form, data, open, done } = compactSchedule();
    open();
    const time = screen.getByLabelText(
      i18n.t('m5s3.plan.plannedStartTime'),
    ) as HTMLInputElement;
    fireEvent.change(time, { target: { value: '' } });
    await done();
    expect(data().get('plannedDate')).toBe('2026-09-05');
    expect(data().get('plannedTime')).toBe('');
    expect(data().get('plannedEnd')).toBe('');
    act(() => form.reset());
    expect(data().get('plannedTime')).toBe('10:00');
    expect(data().get('plannedEnd')).toBe('2026-09-05T11:00');
    open();
    fireEvent.change(screen.getByLabelText(i18n.t('m5s3.plan.plannedDate')), {
      target: { value: '' },
    });
    expect(
      (
        screen.getByLabelText(
          i18n.t('m5s3.plan.plannedStartTime'),
        ) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(data().get('plannedDate')).toBe('');
    expect(data().get('plannedTime')).toBe('');
    expect(data().get('plannedEnd')).toBe('');
  });

  it('keeps the compact trigger and backing fields disabled with the owning editor', () => {
    const { container, data, open } = compactSchedule({ disabled: true });
    expect(
      (
        container.querySelector(
          '.composer-schedule-trigger',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    open();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect([...data()]).toEqual([]);
  });
});
