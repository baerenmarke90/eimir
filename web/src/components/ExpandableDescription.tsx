import { type ReactNode, useId, useMemo, useState } from 'react';
import type { LinkPreviewsApi } from '../api/generated/apis/LinkPreviewsApi';
import {
  descriptionExcerpt,
  readableDescription,
} from '../client/readableDescription';
import { useTranslation } from '../i18n';
import { AuthoredText } from './AuthoredText';
import './ExpandableDescription.css';

/** One local reading disclosure, independent of domain editing and stored content. */
export function ExpandableDescription({
  text,
  scope = '',
  className,
  renderText,
  ...props
}: {
  text: string;
  scope?: string;
  className?: string;
  previewApi?: LinkPreviewsApi;
  spaceId?: string;
  offline?: boolean;
  renderText?: (text: string) => ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const readable = useMemo(() => readableDescription(text), [text]);
  const excerpt = descriptionExcerpt(readable);
  const identity = JSON.stringify([scope, text]);
  const [expandedIdentity, setExpandedIdentity] = useState<string | null>(null);
  const expanded = expandedIdentity === identity;
  const visible = expanded ? readable : excerpt;
  return (
    <div className="expandable-description">
      <div id={id}>
        {renderText ? (
          renderText(visible)
        ) : (
          <AuthoredText
            text={visible}
            scope={scope}
            textClassName={className}
            {...props}
          />
        )}
      </div>
      {excerpt !== readable ? (
        <button
          type="button"
          className="secondary description-disclosure"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpandedIdentity(expanded ? null : identity)}
        >
          {t(
            expanded
              ? 'descriptionDisclosure.less'
              : 'descriptionDisclosure.more',
          )}
        </button>
      ) : null}
    </div>
  );
}
