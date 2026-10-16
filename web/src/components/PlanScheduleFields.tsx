import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '../i18n';

/**
 * Product-level Plan scheduling controls shared by create, Wish conversion and
 * lifecycle correction. Date is optional; time only exists in the context of
 * a date. Clearing a date also clears all wall-clock state, while clearing time
 * deliberately preserves the selected calendar day.
 */
export function PlanScheduleFields({
  idPrefix,
  defaultDate = '',
  defaultTime = '',
  defaultEnd = '',
  includeEnd = false,
}: {
  idPrefix: string;
  defaultDate?: string;
  defaultTime?: string;
  defaultEnd?: string;
  includeEnd?: boolean;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const endPanelId = useId();
  const endErrorId = useId();
  const dateRef = useRef<HTMLInputElement>(null);
  const endTimeRef = useRef<HTMLInputElement>(null);
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
    showEnd && endTime && selectedEndDate
      ? `${selectedEndDate}T${endTime}`
      : '';
  const startValue = date && time ? `${date}T${time}` : '';
  const endRangeInvalid = Boolean(
    startValue && endValue && endValue <= startValue,
  );
  const endError = endRangeInvalid ? t('m5s3.plan.endMustFollowStart') : '';

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
    endTimeRef.current?.setCustomValidity(endError);
  }, [endError]);

  useEffect(() => {
    const form = dateRef.current?.form;
    if (!form) return;
    const reset = () => restoreDefaults();
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [restoreDefaults]);

  return (
    <>
      <label htmlFor={`${idPrefix}-date`}>{t('m5s3.plan.plannedDate')}</label>
      <input
        ref={dateRef}
        id={`${idPrefix}-date`}
        name="plannedDate"
        type="date"
        value={date}
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
        id={`${idPrefix}-time`}
        name="plannedTime"
        type="time"
        value={time}
        disabled={!date}
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
            className="tertiary planning-schedule-disclosure"
            aria-expanded={showEnd}
            aria-controls={endPanelId}
            onClick={() => {
              if (showEnd) {
                clearEnd();
              } else {
                setShowEnd(true);
              }
            }}
          >
            {showEnd ? t('m5s3.plan.removeEndTime') : t('m5s3.plan.addEndTime')}
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
              ref={endTimeRef}
              id={`${idPrefix}-end-time`}
              type="time"
              value={endTime}
              disabled={!showEnd}
              aria-invalid={endRangeInvalid || undefined}
              aria-describedby={endRangeInvalid ? endErrorId : undefined}
              onChange={(event) => setEndTime(event.target.value)}
            />

            <label className="choice-row planning-schedule-cross-day">
              <input
                type="checkbox"
                checked={crossDay}
                disabled={!showEnd}
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
                <input
                  id={`${idPrefix}-end-date`}
                  type="date"
                  min={date}
                  value={endDate}
                  disabled={!showEnd}
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

          <input type="hidden" name="plannedEnd" value={endValue} />
        </>
      ) : null}
    </>
  );
}
