import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';

export interface StoryDetailPageShellProps {
  eyebrow?: string;
  title: ReactNode;
  titleAction?: ReactNode;
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
  eyebrow,
  title,
  titleAction,
  offline = false,
  beforeHeader,
  pageClassName = 'product-detail-page',
  containerClassName,
  containerDataAttributes,
  articleClassName = 'product-detail-card',
  children,
}: StoryDetailPageShellProps) {
  const { t } = useTranslation();

  return (
    <div className={`page ${pageClassName}`.trim()}>
      {beforeHeader}
      {offline ? (
        <div className="inline-message" role="status">
          {t('offlineCache.banner')}
        </div>
      ) : null}
      <PageHeader eyebrow={eyebrow} title={title} titleAction={titleAction} />

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
