import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';
import './FreeComposer.css';

/** Presentation only: the task owns Back guards and the native form action. */
export function ComposerHeader({
  before,
  title,
  titleId,
  action,
  className,
}: {
  before: ReactNode;
  title: ReactNode;
  titleId?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <PageHeader
      before={before}
      title={title}
      titleId={titleId}
      action={action}
      className={className}
      variant="composer"
    />
  );
}

export function StoryEditorPageShell({
  before,
  eyebrow,
  title,
  description,
  headerClassName,
  headerAction,
  quiet = false,
  pageComposer = quiet,
  sectionLabelledBy,
  sectionHeading,
  children,
}: {
  before: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  headerClassName?: string;
  headerAction?: ReactNode;
  quiet?: boolean;
  pageComposer?: boolean;
  sectionLabelledBy: string;
  sectionHeading: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`page page-reading create-page product-editor-page free-composer${quiet ? ' quiet-composer' : ''}${pageComposer ? ' page-composer' : ''}`}
    >
      <PageHeader
        before={before}
        eyebrow={eyebrow}
        title={title}
        description={description}
        className={headerClassName}
        action={headerAction}
        variant={quiet ? 'composer' : 'default'}
      />
      <section
        className="form-card product-sheet"
        aria-labelledby={sectionLabelledBy}
      >
        <h2 id={sectionLabelledBy} className="sr-only">
          {sectionHeading}
        </h2>
        {children}
      </section>
    </div>
  );
}

export function StoryCreatePageShell({
  header,
  pageClassName,
  cardClassName,
  labelledBy,
  children,
}: {
  header: ReactNode;
  pageClassName?: string;
  cardClassName?: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`page page-reading create-page free-composer ${pageClassName ?? ''}`.trim()}
    >
      {header}
      <section
        className={['immersive-create-card', cardClassName]
          .filter(Boolean)
          .join(' ')}
        aria-labelledby={labelledBy}
      >
        {children}
      </section>
    </div>
  );
}
