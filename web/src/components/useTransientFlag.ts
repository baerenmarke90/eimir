import { useCallback, useEffect, useRef, useState } from 'react';

export function useTransientFlag(durationMs: number): [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activate = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    setActive(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setActive(false);
    }, durationMs);
  }, [durationMs]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return [active, activate];
}
