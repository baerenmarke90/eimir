import { useCallback, useLayoutEffect, useRef } from 'react';

/** Own asynchronous feedback for one activation, without owning navigation/history. */
export function useTaskActivation(isActive: boolean, activationKey = '') {
  const ownerRef = useRef<object | null>(null);
  useLayoutEffect(() => {
    if (!isActive) return;
    const owner = { activationKey };
    ownerRef.current = owner;
    return () => {
      if (ownerRef.current === owner) ownerRef.current = null;
    };
  }, [isActive, activationKey]);

  return useCallback(() => {
    const owner = ownerRef.current;
    return () => owner !== null && ownerRef.current === owner;
  }, []);
}
