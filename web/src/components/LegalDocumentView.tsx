import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { resolvedLocale, useTranslation } from '../i18n';
import type {
  LegalBlock,
  LegalDocument,
  LegalInline,
} from '../legal/legalDocument';
import './LegalDocumentView.css';

/** Renders an in-app link, for example as a nested reading sheet in a form. */
export type LegalInternalLinkRenderer = (link: {
  href: string;
  text: string;
}) => ReactNode;

function renderRun(
  run: LegalInline,
  placeholder: (name: string) => string,
  renderInternalLink?: LegalInternalLinkRenderer,
): ReactNode {
  switch (run.kind) {
    case 'strong':
      return <strong>{run.text}</strong>;
    case 'link':
      if (!run.href.startsWith('/'))
        return (
          <a href={run.href} rel="noopener noreferrer">
            {run.text}
          </a>
        );
      return renderInternalLink ? (
        renderInternalLink({ href: run.href, text: run.text })
      ) : (
        <Link to={run.href}>{run.text}</Link>
      );
    case 'placeholder':
      return <mark className="legal-placeholder">{placeholder(run.name)}</mark>;
    default:
      return run.text;
  }
}

function Runs({
  runs,
  renderInternalLink,
}: {
  runs: LegalInline[];
  renderInternalLink?: LegalInternalLinkRenderer;
}) {
  const { t } = useTranslation();
  const placeholder = (name: string) => t('legal.placeholder', { name });
  return runs.map((run, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: Read-only generated legal text has no state or reorder interaction.
    <Fragment key={index}>
      {renderRun(run, placeholder, renderInternalLink)}
    </Fragment>
  ));
}

function Block({
  block,
  sectionLevel,
  renderInternalLink,
}: {
  block: LegalBlock;
  sectionLevel: 2 | 3;
  renderInternalLink?: LegalInternalLinkRenderer;
}) {
  if (block.kind === 'heading') {
    const Heading = sectionLevel === 2 ? 'h2' : 'h3';
    return (
      <Heading id={block.id} className="legal-section-heading">
        <Runs runs={block.content} renderInternalLink={renderInternalLink} />
      </Heading>
    );
  }
  if (block.kind === 'paragraph') {
    return (
      <p>
        <Runs runs={block.content} renderInternalLink={renderInternalLink} />
      </p>
    );
  }
  const List = block.ordered ? 'ol' : 'ul';
  return (
    <List className="legal-list">
      {block.items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Read-only generated legal text has no state or reorder interaction.
        <li key={index}>
          <Runs runs={item.content} renderInternalLink={renderInternalLink} />
          {item.children.length ? (
            <ul className="legal-list legal-list-nested">
              {item.children.map((child, childIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Read-only generated legal text has no state or reorder interaction.
                <li key={childIndex}>
                  <Runs runs={child} renderInternalLink={renderInternalLink} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </List>
  );
}

/** Render one canonical legal document as readable, semantic text. */
export function LegalDocumentView({
  document,
  titleId,
  showTitle = true,
  sectionLevel = 2,
  renderInternalLink,
}: {
  document: LegalDocument;
  titleId?: string;
  showTitle?: boolean;
  sectionLevel?: 2 | 3;
  renderInternalLink?: LegalInternalLinkRenderer;
}) {
  const { t } = useTranslation();
  const uiLocale = resolvedLocale();
  const documentLanguage = document.locale.split('-')[0];
  // A UI translation is not a legal translation: name the binding language.
  const translatedUi = uiLocale.split('-')[0] !== documentLanguage;
  const documentLanguageName =
    new Intl.DisplayNames([uiLocale], { type: 'language' }).of(
      documentLanguage,
    ) ?? document.locale;
  return (
    <article className="legal-document" lang={document.locale}>
      {showTitle ? (
        <h1
          id={titleId}
          className="legal-document-title"
          tabIndex={titleId ? -1 : undefined}
        >
          {document.title}
        </h1>
      ) : null}
      {document.status === 'draft' ? (
        <p className="legal-draft-badge" lang={uiLocale}>
          {t('legal.draftBadge')}
        </p>
      ) : null}
      {translatedUi ? (
        <p className="legal-language-notice" lang={uiLocale}>
          {t('legal.documentLanguageNotice', {
            language: documentLanguageName,
          })}
        </p>
      ) : null}
      {document.blocks.map((block, index) => (
        <Block
          // biome-ignore lint/suspicious/noArrayIndexKey: Read-only generated legal text has no state or reorder interaction.
          key={index}
          block={block}
          sectionLevel={sectionLevel}
          renderInternalLink={renderInternalLink}
        />
      ))}
    </article>
  );
}
