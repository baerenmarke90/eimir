import {
  type FormEvent,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  dateInputValueToApiDate,
  formatDateSummary,
  localDateInputValue,
} from '../client/dateInput';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { EimirIcon } from './EimirIcon';
import { NativeDateField } from './NativeDateField';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './ComposerDateContext.css';

export interface ComposerDateContextHandle {
  focus(target?: 'start' | 'end'): void;
  reportValidity(): boolean;
}

/** Native calendar selection with stable form ownership while its sheet is closed. */
export function ComposerDateContext({
  idPrefix,
  label,
  name = 'happenedOn',
  value,
  defaultValue = '',
  onChange,
  required = false,
  formId,
  disabled = false,
  error,
  allowRange = false,
  endName = 'happenedUntil',
  endValue,
  defaultEndValue = '',
  onEndChange,
  endError,
  ref,
}: {
  idPrefix: string;
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  formId?: string;
  disabled?: boolean;
  error?: string;
  allowRange?: boolean;
  endName?: string;
  endValue?: string;
  defaultEndValue?: string;
  onEndChange?: (value: string) => void;
  endError?: string;
  ref?: Ref<ComposerDateContextHandle>;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  const [localValue, setLocalValue] = useState(defaultValue);
  const [localEnd, setLocalEnd] = useState(defaultEndValue);
  const date = value ?? localValue;
  const through = allowRange ? (endValue ?? localEnd) : '';
  const [open, setOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<'start' | 'end'>('start');
  const [localError, setLocalError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const nativeStart = useRef<HTMLInputElement>(null);
  const nativeEnd = useRef<HTMLInputElement>(null);
  const startBacking = useRef<HTMLInputElement>(null);
  const endBacking = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value === undefined) setLocalValue(defaultValue);
  }, [defaultValue, value]);
  useEffect(() => {
    if (endValue === undefined) setLocalEnd(defaultEndValue);
  }, [defaultEndValue, endValue]);

  function changeDate(next: string) {
    setLocalValue(next);
    setLocalError('');
    onChange?.(next);
  }
  function changeEnd(next: string) {
    setLocalEnd(next);
    setLocalError('');
    onEndChange?.(next);
  }
  function focus(target: 'start' | 'end' = 'start') {
    setFocusTarget(target);
    setOpen(true);
    if (open) (target === 'end' ? nativeEnd : nativeStart).current?.focus();
  }
  function invalidTarget(): 'start' | 'end' | null {
    try {
      if (date) dateInputValueToApiDate(date);
      else if (required) return 'start';
    } catch {
      return 'start';
    }
    try {
      if (through) dateInputValueToApiDate(through);
    } catch {
      return 'end';
    }
    if (date && through && through < date) return 'end';
    return null;
  }
  function reportValidity() {
    const target = invalidTarget();
    if (!target) {
      setLocalError('');
      return true;
    }
    setLocalError(
      target === 'end' && date && through && through < date
        ? t('experiences.invalidPeriod')
        : t('taskBoundary.invalidDate'),
    );
    focus(target);
    return false;
  }
  useImperativeHandle(ref, () => ({ focus, reportValidity }));

  useEffect(() => {
    const form = startBacking.current?.form;
    if (!form) return;
    const reset = () => {
      if (value === undefined) setLocalValue(defaultValue);
      if (endValue === undefined) setLocalEnd(defaultEndValue);
      setLocalError('');
    };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [defaultEndValue, defaultValue, endValue, value]);

  function interceptInvalid(event: FormEvent<HTMLInputElement>) {
    event.preventDefault();
    reportValidity();
  }
  function summary(value: string) {
    if (!value) return label;
    try {
      return formatDateSummary(value, resolvedLocale());
    } catch {
      return value;
    }
  }
  const dateSummary = `${summary(date)}${through ? ` – ${summary(through)}` : ''}`;
  const startError = error || (focusTarget === 'start' ? localError : '');
  const rangeError = endError || (focusTarget === 'end' ? localError : '');
  const visibleError = startError || rangeError;

  return (
    <div className="composer-date-context">
      <button
        ref={trigger}
        type="button"
        className="composer-context-trigger composer-date-trigger tertiary"
        disabled={disabled}
        aria-label={`${label}: ${dateSummary}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={Boolean(visibleError) || undefined}
        aria-describedby={visibleError && !open ? errorId : undefined}
        onClick={() => focus()}
      >
        <EimirIcon name="kalender" />
        <span>{dateSummary}</span>
        <EimirIcon name="chevron-right" />
      </button>
      {/* These native controls preserve FormData and constraint validation when the sheet unmounts. */}
      <input
        ref={startBacking}
        className="sr-only composer-date-backing"
        type="date"
        name={name}
        form={formId}
        value={date}
        max="9999-12-31"
        required={required}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => changeDate(event.target.value)}
        onInvalid={interceptInvalid}
      />
      {allowRange ? (
        <input
          ref={endBacking}
          className="sr-only composer-date-backing"
          type="date"
          name={endName}
          form={formId}
          value={through}
          min={date || undefined}
          max="9999-12-31"
          disabled={disabled}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => changeEnd(event.target.value)}
          onInvalid={interceptInvalid}
        />
      ) : null}
      {visibleError && !open ? (
        <p id={errorId} className="field-error" role="alert">
          {visibleError}
        </p>
      ) : null}
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={label}
        onClose={() => setOpen(false)}
        restoreFocusRef={trigger}
        initialFocusRef={focusTarget === 'end' ? nativeEnd : nativeStart}
        isCloseBlocked={disabled}
        className="composer-date-sheet"
        footer={
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (reportValidity()) sheet.current?.requestClose();
            }}
          >
            {t('experiences.finish')}
          </button>
        }
      >
        <NativeDateField
          ref={nativeStart}
          id={idPrefix}
          label={label}
          value={date}
          max="9999-12-31"
          required={required}
          disabled={disabled}
          error={startError || undefined}
          onChange={(event) => changeDate(event.target.value)}
        />
        {allowRange ? (
          through ? (
            <>
              <NativeDateField
                ref={nativeEnd}
                id={`${idPrefix}-through`}
                label={t('experiences.through')}
                value={through}
                min={date || undefined}
                max="9999-12-31"
                disabled={disabled}
                error={rangeError || undefined}
                onChange={(event) => changeEnd(event.target.value)}
              />
              <button
                type="button"
                className="tertiary"
                disabled={disabled}
                onClick={() => changeEnd('')}
              >
                {t('experiences.removePeriod')}
              </button>
            </>
          ) : (
            <AddActionButton
              label={t('experiences.addPeriod')}
              disabled={disabled}
              onClick={() => changeEnd(date || localDateInputValue())}
            />
          )
        ) : null}
      </ShortTaskSheet>
    </div>
  );
}
