import './StoryReading.css';
import './PageComposerDetail.css';
import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';

export interface StoryDetailPageShellProps {
  before?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  titleAction?: ReactNode;
  titleContext?: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  offline?: boolean;
  beforeHeader?: ReactNode;
  pageClassName?: string;
  containerClassName: string;
  containerDataAttributes?: Record<`data-${string}`, string>;
  articleClassName?: string;
  children: ReactNode;
}

/**
 * Shared read/detail composition for Story products.
 *
 * Product-specific content, permissions, comments, privacy, provenance and
 * mutations stay with the caller; this component owns only the common page
 * framing contract.
 */
export function StoryDetailPageShell({
  before,
  eyebrow,
  title,
  titleAction,
  titleContext,
  description,
  metadata,
  offline = false,
  beforeHeader,
  pageClassName = 'product-detail-page',
  containerClassName,
  containerDataAttributes,
  articleClassName = 'product-detail-card',
  children,
}: StoryDetailPageShellProps) {
  const { t } = useTranslation();
  const composed = pageClassName.includes('page-composer-detail');

  return (
    <div className={`page story-reading ${pageClassName}`.trim()}>
      {!composed ? beforeHeader : null}
      {offline ? (
        <div className="inline-message" role="status">
          {t('offlineCache.banner')}
        </div>
      ) : null}
      <PageHeader
        before={before}
        variant={composed ? 'composer' : 'default'}
        action={composed ? titleAction : undefined}
        eyebrow={eyebrow}
        title={title}
        titleAction={composed ? undefined : titleAction}
        titleContext={titleContext}
        metadata={composed ? undefined : metadata}
        description={description}
      />

      {composed ? beforeHeader : null}
      {composed ? metadata : null}
      <div {...containerDataAttributes} className={containerClassName}>
        <article
          className={`story-surface ${articleClassName} coffee-table-layout`.trim()}
        >
          {children}
        </article>
      </div>
    </div>
  );
}
