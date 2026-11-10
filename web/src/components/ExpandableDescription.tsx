import {
  type ReactNode,
  useId,
  useMemo,
  useState,
  useLayoutEffect,
  useRef,
} from 'react';
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
  const content = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<{
    identity: string;
    value: boolean;
  }>();
  useLayoutEffect(() => {
    const element = content.current;
    if (!element?.closest('.page-composer-detail')) return;
    const measure = () => {
      const line = Number.parseFloat(getComputedStyle(element).lineHeight);
      const value =
        Number.isFinite(line) && element.scrollHeight > line * 5 + 1;
      setOverflow((previous) =>
        previous?.identity === identity && previous.value === value
          ? previous
          : { identity, value },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [identity]);
  const collapsible =
    excerpt !== readable || (overflow?.identity === identity && overflow.value);
  const visible = expanded ? readable : excerpt;
  return (
    <div
      className="expandable-description"
      data-collapsible={collapsible || undefined}
      data-expanded={expanded || undefined}
    >
      <div id={id} ref={content}>
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
      {collapsible ? (
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
