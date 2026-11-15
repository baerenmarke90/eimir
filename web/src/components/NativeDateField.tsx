import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { openNativeDatePicker } from '../client/dateInput';
import './NativeDateField.css';

/** One native interaction for every calendar field; the whole field opens it. */
export const NativeDateInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<'input'>, 'type'> & {
    openPickerOnClick?: boolean;
  }
>(function NativeDateInput(
  { onClick, className, openPickerOnClick = true, ...props },
  ref,
) {
  return (
    <input
      {...props}
      ref={ref}
      type="date"
      className={['native-date-input', className].filter(Boolean).join(' ')}
      onClick={(event) => {
        onClick?.(event);
        if (openPickerOnClick && !event.defaultPrevented)
          openNativeDatePicker(event);
      }}
    />
  );
});

export type NativeDateFieldProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'aria-invalid'
> & {
  label: ReactNode;
  helpText?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
  openPickerOnClick?: boolean;
};

function describedByIds(
  existing: string | undefined,
  helpId: string | undefined,
  errorId: string | undefined,
): string | undefined {
  const ids = [existing, helpId, errorId].filter(Boolean).join(' ');
  return ids || undefined;
}

export const NativeDateField = forwardRef<
  HTMLInputElement,
  NativeDateFieldProps
>(function NativeDateField(
  {
    id,
    label,
    helpText,
    error,
    fieldClassName,
    openPickerOnClick = true,
    onClick,
    'aria-describedby': ariaDescribedBy,
    ...inputProps
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `native-date-${generatedId}`;
  const hasHelp =
    helpText !== undefined && helpText !== null && helpText !== false;
  const hasError = error !== undefined && error !== null && error !== false;
  const helpId = hasHelp ? `${inputId}-help` : undefined;
  const errorId = hasError ? `${inputId}-error` : undefined;
  const describedBy = describedByIds(ariaDescribedBy, helpId, errorId);
  const fieldClassNames = ['field-group', fieldClassName]
    .filter(Boolean)
    .join(' ');

  const handleClick = (event: MouseEvent<HTMLInputElement>) => {
    onClick?.(event);
    if (openPickerOnClick && !event.defaultPrevented) {
      openNativeDatePicker(event);
    }
  };

  return (
    <div className={fieldClassNames}>
      <label htmlFor={inputId}>{label}</label>
      <NativeDateInput
        {...inputProps}
        ref={ref}
        id={inputId}
        openPickerOnClick={false}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        onClick={openPickerOnClick || onClick ? handleClick : undefined}
      />
      {hasHelp ? (
        <p id={helpId} className="field-help">
          {helpText}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="field-help status-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
