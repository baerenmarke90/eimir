import type { ReactNode } from 'react';
import { BackSlotHost, useSecondaryPage } from './TaskBackButton';
import './PageHeader.css';

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
  itemLabel,
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
  /**
   * The localized type of the one named item a secondary page shows. Back, this
   * label and the title action then share the header row and the title follows
   * as the item's heading (COMPONENT-CONTRACTS 5.4).
   */
  itemLabel?: ReactNode;
  className?: string;
  variant?: 'default' | 'root' | 'composer';
}) {
  const secondary = useSecondaryPage() && variant === 'default';
  const variantClassName =
    variant === 'root'
      ? 'page-heading-root'
      : variant === 'composer'
        ? 'composer-header'
        : '';

  if (secondary) {
    const item = itemLabel !== undefined && itemLabel !== null;
    const titleBlock = titleEditor ?? (
      <div className="page-heading-title-container">
        <h1 id={titleId} className="page-heading-secondary-title">
          {title}
        </h1>
        {titleContext}
        {item ? null : titleAction}
      </div>
    );
    return (
      <>
        {before}
        <header
          className={`page-heading page-heading-secondary ${item ? 'page-heading-item' : ''} ${titleAction && !item ? 'page-heading-has-title-action' : ''} ${className}`.trim()}
        >
          {item ? (
            <div className="page-heading-item-row">
              <BackSlotHost />
              <p className="page-heading-item-label">{itemLabel}</p>
              <div className="page-heading-item-action">{titleAction}</div>
            </div>
          ) : null}
          <div>
            {item ? (
              titleBlock
            ) : (
              <div className="page-heading-title-row">
                <BackSlotHost />
                {titleBlock}
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

  return (
    <>
      {variant !== 'composer' ? before : null}
      <header
        className={`page-heading ${titleAction ? 'page-heading-has-title-action' : ''} ${variantClassName} ${className}`.trim()}
      >
        {variant === 'composer' ? before : null}
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
