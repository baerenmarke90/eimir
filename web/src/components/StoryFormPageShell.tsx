import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

export function StoryEditorPageShell({
  before,
  eyebrow,
  title,
  description,
  headerClassName,
  sectionLabelledBy,
  sectionHeading,
  children,
}: {
  before: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  headerClassName?: string;
  sectionLabelledBy: string;
  sectionHeading: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page page-reading create-page product-editor-page">
      <PageHeader
        before={before}
        eyebrow={eyebrow}
        title={title}
        description={description}
        className={headerClassName}
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
      className={`page page-reading create-page ${pageClassName ?? ''}`.trim()}
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
