import type { ReactNode } from 'react';
import './MediaActionGroup.css';

/** A single shared boundary for device, external-source and voice intake. */
export function MediaActionGroup({ children }: { children: ReactNode }) {
  return <div className="media-action-group">{children}</div>;
}
