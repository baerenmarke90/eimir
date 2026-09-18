import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  titleAction,
  titleEditor,
  description,
  action,
  before,
  className = '',
}: {
  eyebrow?: string;
  title: ReactNode;
  titleAction?: ReactNode;
  titleEditor?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  before?: ReactNode;
  className?: string;
}) {
  return (
    <>
      {before}
      <header className={`page-heading ${className}`.trim()}>
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          {titleEditor ? (
            titleEditor
          ) : (
            <div className="page-heading-title-container">
              <h1>{title}</h1>
              {titleAction}
            </div>
          )}
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="page-heading-action">{action}</div> : null}
      </header>
    </>
  );
}
