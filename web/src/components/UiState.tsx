import type { ReactNode } from 'react';

export type UiStateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission'
  | 'offline'
  | 'conflict'
  | 'rateLimit';

const STATE_MARKS: Record<UiStateKind, string> = {
  loading: '…',
  empty: '◇',
  error: '!',
  permission: '○',
  offline: '↯',
  conflict: '↻',
  rateLimit: '⌛',
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
        {kind === 'empty' ? (
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="100%"
            height="100%"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--color-brand)' }}
          >
            <path d="M4.17 14.71a4.93 4.93 0 1 0 7.82 5.9l.01-.02.01.02a4.93 4.93 0 1 0 7.82-5.9" />
            <path
              d="M21 8.5c0 3.33-4 6.5-9 10-5-3.5-9-6.67-9-10 0-2.5 2-4.5 4.5-4.5 2.1 0 3.8 1.4 4.3 3.3.1.4.9.4 1 0 .5-1.9 2.2-3.3 4.3-3.3 2.5 0 4.5 2 4.5 4.5z"
              opacity="0.4"
            />
          </svg>
        ) : (
          STATE_MARKS[kind]
        )}
      </span>
      <div className="ui-state-copy">
        <strong>{title}</strong>
        {body ? <p>{body}</p> : null}
      </div>
      {action ? <div className="ui-state-action">{action}</div> : null}
    </div>
  );
}
