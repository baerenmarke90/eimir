import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  appShortcuts,
  hasAppShortcuts,
  readAppShortcut,
  type AppShortcutRequest,
} from './appShortcuts';
import {
  MEMORY_CREATE_ROUTE,
  PLAN_CREATE_ROUTE,
  WISH_CREATE_ROUTE,
} from './routes';
import { postSnackbar } from './snackbar';
import {
  isDocumentLeaveBlocked,
  useDocumentLeaveBlocked,
} from './useDocumentLeaveGuard';

const destinations = {
  moment: MEMORY_CREATE_ROUTE,
  wish: WISH_CREATE_ROUTE,
  plan: PLAN_CREATE_ROUTE,
};

/** Mounted only inside the authorized Space; native memory holds earlier taps. */
export function useAppShortcuts(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const blocked = useDocumentLeaveBlocked();
  const [pending, setPending] = useState<AppShortcutRequest | null>(null);
  const handled = useRef<string | null>(null);
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (!hasAppShortcuts()) return;
    let active = true;
    let inspection = 0;
    const inspect = async () => {
      const order = ++inspection;
      const result = await appShortcuts.peek().catch(() => null);
      if (active && order === inspection)
        setPending(readAppShortcut(result?.request));
    };
    // Subscribe before reading, so a tap between readiness and peek is retained.
    const subscription = appShortcuts.addListener(
      'shortcutOpen',
      () => void inspect(),
    );
    void subscription
      .then(() => {
        if (active) void inspect();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      void subscription
        .then((listener) => listener.remove())
        .catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!pending || handled.current === pending.id) return;
    const destination = destinations[pending.action];
    // Selecting the current task reveals its draft without remounting it.
    const alreadyOpen = location.pathname === destination;
    if (!alreadyOpen && (blocked || isDocumentLeaveBlocked())) {
      if (announced.current !== pending.id) {
        announced.current = pending.id;
        postSnackbar('snackbar.appShortcutWaiting');
      }
      return;
    }
    handled.current = pending.id;
    setPending(null);
    if (!alreadyOpen) void navigate(destination);
    // A newer native tap must never be cleared by this older completion.
    void appShortcuts.acknowledge({ id: pending.id }).catch(() => undefined);
  }, [blocked, location.pathname, navigate, pending]);
}
