import { useEffect, useRef, useState } from 'react';
import { ClientProblemError } from '../client/problemDetails';

export function useRequiredTitleValidation(
  error: unknown,
  serverErrorCode: string,
  resetServerError: () => void,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientInvalid, setClientInvalid] = useState(false);
  const serverInvalid =
    error instanceof ClientProblemError && error.code === serverErrorCode;
  const invalid = clientInvalid || serverInvalid;

  useEffect(() => {
    if (serverInvalid) inputRef.current?.focus();
  }, [serverInvalid]);

  function validate(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      setClientInvalid(true);
      inputRef.current?.focus();
      return null;
    }
    setClientInvalid(false);
    return trimmed;
  }

  function handleChange(value: string) {
    if (!value.trim()) return;
    setClientInvalid(false);
    if (serverInvalid) resetServerError();
  }

  return {
    inputRef,
    invalid,
    serverInvalid,
    validate,
    handleChange,
  };
}
