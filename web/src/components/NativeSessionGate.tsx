import { useEffect, useState, type ReactNode } from 'react';
import { BrandedStartup } from './BrandedStartup';

/**
 * Paint a safe branded startup immediately while the native credential slot
 * restores. The promise is created once outside StrictMode; no private content
 * or session-dependent requests mount until restoration settles.
 */
export function NativeSessionGate({
  restoration,
  label,
  children,
}: {
  restoration: Promise<void> | null;
  label: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(restoration === null);

  useEffect(() => {
    if (!restoration) return;
    let active = true;
    const finish = () => {
      if (active) setReady(true);
    };
    void restoration.then(finish, finish);
    return () => {
      active = false;
    };
  }, [restoration]);

  return ready ? <>{children}</> : <BrandedStartup label={label} />;
}
