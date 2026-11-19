import { type FormEvent, useId, useState } from 'react';

/**
 * Shows a required/format problem as an app-styled inline message instead of
 * the browser's native bubble (#2063). The field keeps its native constraints
 * (`required`, `type="email"`), so the form still refuses to submit; the
 * `invalid` event is only intercepted to render our own localized text and to
 * move focus to the field.
 */
export function useInlineFieldError(messages: {
  missing: string;
  mismatch?: string;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;
  return {
    error,
    errorId,
    fieldProps: {
      'aria-invalid': error ? (true as const) : undefined,
      'aria-describedby': error ? errorId : undefined,
      onInvalid: (event: FormEvent<HTMLInputElement>) => {
        event.preventDefault();
        const field = event.currentTarget;
        setError(
          field.validity.valueMissing
            ? messages.missing
            : (messages.mismatch ?? messages.missing),
        );
        field.focus();
      },
      onInput: () => setError(null),
    },
  };
}
