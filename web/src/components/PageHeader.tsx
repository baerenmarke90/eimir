import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  titleId,
  titleAction,
  titleEditor,
  titleContext,
  metadata,
  description,
  action,
  before,
  className = '',
  variant = 'default',
}: {
  eyebrow?: string;
  title: ReactNode;
  titleId?: string;
  titleAction?: ReactNode;
  titleEditor?: ReactNode;
  titleContext?: ReactNode;
  metadata?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  before?: ReactNode;
  className?: string;
  variant?: 'default' | 'root';
}) {
  const variantClassName = variant === 'root' ? 'page-heading-root' : '';

  return (
    <>
      {before}
      <header
        className={`page-heading ${titleAction ? 'page-heading-has-title-action' : ''} ${variantClassName} ${className}`.trim()}
      >
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          {titleEditor ? (
            titleEditor
          ) : (
            <div className="page-heading-title-container">
              <h1 id={titleId}>{title}</h1>
              {titleContext}
              {titleAction}
            </div>
          )}
          {metadata}
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="page-heading-action">{action}</div> : null}
      </header>
    </>
  );
}
