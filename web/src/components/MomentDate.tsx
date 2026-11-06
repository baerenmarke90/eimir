import type { ReactNode } from 'react';
import { EimirIcon } from './EimirIcon';
import './MomentMetadata.css';

/** Date-only meaning and formatting stay with the owning content. */
export function MomentDate({
  dateTime,
  children,
}: {
  dateTime?: string;
  children: ReactNode;
}) {
  return (
    <span className="moment-date">
      <EimirIcon name="kalender" />
      <time dateTime={dateTime}>{children}</time>
    </span>
  );
}
