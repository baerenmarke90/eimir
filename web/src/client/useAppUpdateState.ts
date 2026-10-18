import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppUpdatesAdapter, AppUpdateState } from './appUpdates';

/** The same native snapshot/event ownership for the settings entry and detail. */
export function useAppUpdateState(adapter: AppUpdatesAdapter) {
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [readError, setReadError] = useState(false);
  const activation = useRef(0);
  const mounted = useRef(false);
  const latestRevision = useRef(-1);
  const acceptState = useCallback((next: AppUpdateState) => {
    if (!mounted.current || next.revision < latestRevision.current) return;
    latestRevision.current = next.revision;
    setReadError(false);
    setState(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const current = ++activation.current;
    latestRevision.current = -1;
    const receive = (next: AppUpdateState) => {
      if (activation.current === current) acceptState(next);
    };
    const subscription = adapter.addListener('stateChanged', receive);
    void subscription
      .then(() => adapter.getState())
      .then(receive)
      .catch(() => {
        if (activation.current === current) setReadError(true);
      });
    return () => {
      mounted.current = false;
      activation.current++;
      void subscription
        .then((listener) => listener.remove())
        .catch(() => undefined);
    };
  }, [adapter, acceptState]);

  return { state, readError, acceptState };
}
