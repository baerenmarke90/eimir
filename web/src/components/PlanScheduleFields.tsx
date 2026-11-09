import { NativeDateInput } from './NativeDateField';
import {
  type Ref,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { planScheduleLabel } from '../client/planningPresentation';
import { planScheduleFromInputs } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { AddActionContent } from './AddAction';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

export interface PlanScheduleFieldsHandle {
  reportValidity: () => boolean;
}

/**
 * Product-level Plan scheduling controls shared by create, Wish conversion and
 * lifecycle correction. Date is optional; time only exists in the context of
 * a date. Clearing a date also clears all wall-clock state, while clearing time
 * deliberately preserves the selected calendar day.
 */
export function PlanScheduleFields({
  idPrefix,
  formId,
  defaultDate = '',
  defaultTime = '',
  defaultEnd = '',
  includeEnd = false,
  compact = false,
  disabled = false,
  ref,
}: {
  idPrefix: string;
  formId?: string;
  defaultDate?: string;
  defaultTime?: string;
  defaultEnd?: string;
  includeEnd?: boolean;
  compact?: boolean;
  disabled?: boolean;
  ref?: Ref<PlanScheduleFieldsHandle>;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const endPanelId = useId();
  const endErrorId = useId();
  const sheetId = useId();
  const dateRef = useRef<HTMLInputElement>(null);
  const backingDateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const endTimeRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<ShortTaskSheetHandle>(null);
  const invalidFocusRef = useRef<'end-time' | 'end-date' | null>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultDate ? defaultTime : '');
  const initialEnd = defaultDate && defaultTime ? defaultEnd : '';
  const [showEnd, setShowEnd] = useState(Boolean(initialEnd));
  const [endTime, setEndTime] = useState(initialEnd.slice(11, 16));
  const [endDate, setEndDate] = useState(initialEnd.slice(0, 10));
  const [crossDay, setCrossDay] = useState(
    Boolean(initialEnd && initialEnd.slice(0, 10) !== defaultDate),
  );

  const selectedEndDate = crossDay ? endDate : date;
  const endValue =
    includeEnd && showEnd && endTime && selectedEndDate
      ? `${selectedEndDate}T${endTime}`
      : '';
  const startValue = date && time ? `${date}T${time}` : '';
  const endRangeInvalid = Boolean(
    startValue && endValue && endValue <= startValue,
  );
  const endError = endRangeInvalid ? t('m5s3.plan.endMustFollowStart') : '';
  const missingEndDate = Boolean(
    includeEnd && showEnd && endTime && crossDay && !endDate,
  );

  const restoreDefaults = useCallback(() => {
    const nextEnd = defaultDate && defaultTime ? defaultEnd : '';
    setDate(defaultDate);
    setTime(defaultDate ? defaultTime : '');
    setShowEnd(Boolean(nextEnd));
    setEndTime(nextEnd.slice(11, 16));
    setEndDate(nextEnd.slice(0, 10));
    setCrossDay(Boolean(nextEnd && nextEnd.slice(0, 10) !== defaultDate));
  }, [defaultDate, defaultEnd, defaultTime]);

  function clearEnd() {
    setShowEnd(false);
    setEndTime('');
    setEndDate('');
    setCrossDay(false);
  }

  useEffect(() => {
    restoreDefaults();
  }, [restoreDefaults]);

  useEffect(() => {
    if (compact && !open) return;
    endTimeRef.current?.setCustomValidity(endError);
  }, [compact, endError, open]);

  useEffect(() => {
    const form = (compact ? backingDateRef : dateRef).current?.form;
    if (!form) return;
    const reset = () => restoreDefaults();
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [compact, restoreDefaults]);

  const reportValidity = useCallback(() => {
    if (disabled) return true;
    if (compact && (endRangeInvalid || missingEndDate)) {
      invalidFocusRef.current = missingEndDate ? 'end-date' : 'end-time';
      setOpen(true);
      if (open) {
        const target = missingEndDate ? endDateRef.current : endTimeRef.current;
        target?.focus({ preventScroll: true });
        target?.reportValidity();
        invalidFocusRef.current = null;
      }
      return false;
    }
    return [
      dateRef.current,
      timeRef.current,
      endTimeRef.current,
      endDateRef.current,
    ]
      .filter((input): input is HTMLInputElement => Boolean(input))
      .every((input) => input.reportValidity());
  }, [compact, disabled, endRangeInvalid, missingEndDate, open]);

  useImperativeHandle(ref, () => ({ reportValidity }), [reportValidity]);

  useEffect(() => {
    if (!compact || !open || !invalidFocusRef.current) return;
    const target =
      invalidFocusRef.current === 'end-date'
        ? endDateRef.current
        : endTimeRef.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.reportValidity();
    invalidFocusRef.current = null;
  }, [compact, open]);

  const fields = (
    <>
      <label htmlFor={`${idPrefix}-date`}>{t('m5s3.plan.plannedDate')}</label>
      <NativeDateInput
        form={formId}
        ref={dateRef}
        id={`${idPrefix}-date`}
        name={compact ? undefined : 'plannedDate'}
        value={date}
        disabled={disabled}
        onChange={(event) => {
          const nextDate = event.target.value;
          setDate(nextDate);
          if (!nextDate) {
            setTime('');
            clearEnd();
          }
        }}
      />

      <label htmlFor={`${idPrefix}-time`}>
        {includeEnd
          ? t('m5s3.plan.plannedStartTime')
          : t('m5s3.plan.plannedTime')}
      </label>
      <input
        ref={timeRef}
        form={formId}
        id={`${idPrefix}-time`}
        name={compact ? undefined : 'plannedTime'}
        type="time"
        value={time}
        disabled={disabled || !date}
        aria-describedby={hintId}
        onChange={(event) => {
          const nextTime = event.target.value;
          setTime(nextTime);
          if (!nextTime) clearEnd();
        }}
      />
      <small id={hintId} className="field-help planning-schedule-help">
        {t('m5s3.plan.plannedTimeHint')}
      </small>

      {includeEnd && date && time ? (
        <>
          <button
            type="button"
            className={
              showEnd ? 'tertiary planning-schedule-disclosure' : 'add-action'
            }
            aria-expanded={showEnd}
            aria-controls={endPanelId}
            disabled={disabled}
            onClick={() => {
              if (showEnd) {
                clearEnd();
              } else {
                setShowEnd(true);
              }
            }}
          >
            {showEnd ? (
              t('m5s3.plan.removeEndTime')
            ) : (
              <AddActionContent label={t('m5s3.plan.addEndTime')} />
            )}
          </button>

          <div
            id={endPanelId}
            className="planning-schedule-end-fields"
            hidden={!showEnd}
          >
            <label htmlFor={`${idPrefix}-end-time`}>
              {t('m5s3.plan.endTime')}
            </label>
            <input
              form={formId}
              ref={endTimeRef}
              id={`${idPrefix}-end-time`}
              type="time"
              value={endTime}
              disabled={disabled || !showEnd}
              aria-invalid={endRangeInvalid || undefined}
              aria-describedby={endRangeInvalid ? endErrorId : undefined}
              onChange={(event) => setEndTime(event.target.value)}
            />

            <label className="choice-row planning-schedule-cross-day">
              <input
                form={formId}
                type="checkbox"
                checked={crossDay}
                disabled={disabled || !showEnd}
                onChange={(event) => {
                  const nextCrossDay = event.target.checked;
                  setCrossDay(nextCrossDay);
                  if (nextCrossDay && !endDate) setEndDate(date);
                }}
              />
              <span>{t('m5s3.plan.endsAnotherDay')}</span>
            </label>

            {crossDay ? (
              <>
                <label htmlFor={`${idPrefix}-end-date`}>
                  {t('m5s3.plan.endDate')}
                </label>
                <NativeDateInput
                  ref={endDateRef}
                  form={formId}
                  id={`${idPrefix}-end-date`}
                  min={date}
                  value={endDate}
                  disabled={disabled || !showEnd}
                  required={Boolean(endTime)}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </>
            ) : null}

            {endRangeInvalid ? (
              <p id={endErrorId} className="field-error" role="alert">
                {endError}
              </p>
            ) : null}
          </div>

          {!compact ? (
            <input
              form={formId}
              type="hidden"
              name="plannedEnd"
              value={endValue}
            />
          ) : null}
        </>
      ) : null}
    </>
  );

  if (!compact) return fields;

  const schedule = planScheduleFromInputs(date, time, endValue);
  const summary =
    planScheduleLabel({
      plannedOn: schedule?.plannedOn ?? null,
      plannedStart: schedule?.plannedStart ?? null,
      plannedEnd: schedule?.plannedEnd ?? null,
    }) ?? t('m5s3.overview.undatedHeading');
  return (
    <div className="composer-schedule-context">
      <input
        ref={backingDateRef}
        form={formId}
        type="hidden"
        name="plannedDate"
        value={date}
        disabled={disabled}
      />
      <input
        form={formId}
        type="hidden"
        name="plannedTime"
        value={time}
        disabled={disabled}
      />
      <input
        form={formId}
        type="hidden"
        name="plannedEnd"
        value={endValue}
        disabled={disabled}
      />
      <button
        ref={triggerRef}
        type="button"
        className="composer-context-trigger composer-schedule-trigger tertiary"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={sheetId}
        aria-invalid={endRangeInvalid || missingEndDate || undefined}
        onClick={() => setOpen(true)}
      >
        <EimirIcon name="kalender" />
        <span>
          <span className="sr-only">{t('m5s3.plan.schedule')}: </span>
          {summary}
        </span>
        <EimirIcon name="chevron-right" />
      </button>
      {!open && endError ? (
        <p className="field-error" role="alert">
          {endError}
        </p>
      ) : null}
      <ShortTaskSheet
        ref={sheetRef}
        id={sheetId}
        open={open}
        title={t('m5s3.plan.schedule')}
        restoreFocusRef={triggerRef}
        isCloseBlocked={disabled}
        onClose={() => setOpen(false)}
        footer={
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (reportValidity()) sheetRef.current?.requestClose();
            }}
          >
            {t('experiences.finish')}
          </button>
        }
      >
        <fieldset
          className="form-grid composer-schedule-fields"
          disabled={disabled}
        >
          <legend className="sr-only">{t('m5s3.plan.schedule')}</legend>
          {fields}
        </fieldset>
      </ShortTaskSheet>
    </div>
  );
}
