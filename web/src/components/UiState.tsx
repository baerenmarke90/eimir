import type { ReactNode } from 'react';
import { EimirIcon, type EimirIconName } from './EimirIcon';

export type UiStateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission'
  | 'offline'
  | 'conflict'
  | 'rateLimit';

const STATE_MARKS: Record<UiStateKind, EimirIconName> = {
  loading: 'overflow',
  empty: 'heart',
  error: 'warning',
  permission: 'shield',
  offline: 'cloud-off',
  conflict: 'refresh',
  rateLimit: 'aktivitaet',
};

export function UiState({
  kind,
  title,
  body,
  action,
  compact = false,
}: {
  kind: UiStateKind;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const role = kind === 'error' ? 'alert' : 'status';

  return (
    <div
      className={`ui-state ui-state-${kind}${compact ? ' ui-state-compact' : ''}`}
      role={role}
      aria-live={kind === 'loading' ? 'polite' : undefined}
      aria-busy={kind === 'loading' || undefined}
    >
      <span className="ui-state-mark" aria-hidden="true">
        <EimirIcon name={STATE_MARKS[kind]} />
      </span>
      <div className="ui-state-copy">
        <strong>{title}</strong>
        {body ? <p>{body}</p> : null}
      </div>
      {action ? <div className="ui-state-action">{action}</div> : null}
    </div>
  );
}
