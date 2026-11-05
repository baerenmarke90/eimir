import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import type {
  LegalBlock,
  LegalDocument,
  LegalInline,
} from '../legal/legalDocument';
import './LegalDocumentView.css';

function renderRun(
  run: LegalInline,
  placeholder: (name: string) => string,
): ReactNode {
  switch (run.kind) {
    case 'strong':
      return <strong>{run.text}</strong>;
    case 'link':
      return run.href.startsWith('/') ? (
        <Link to={run.href}>{run.text}</Link>
      ) : (
        <a href={run.href} rel="noopener noreferrer">
          {run.text}
        </a>
      );
    case 'placeholder':
      return <mark className="legal-placeholder">{placeholder(run.name)}</mark>;
    default:
      return run.text;
  }
}

function Runs({ runs }: { runs: LegalInline[] }) {
  const { t } = useTranslation();
  const placeholder = (name: string) => t('legal.placeholder', { name });
  return runs.map((run, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: Read-only generated legal text has no state or reorder interaction.
    <Fragment key={index}>{renderRun(run, placeholder)}</Fragment>
  ));
}

function Block({
  block,
  sectionLevel,
}: {
  block: LegalBlock;
  sectionLevel: 2 | 3;
}) {
  if (block.kind === 'heading') {
    const Heading = sectionLevel === 2 ? 'h2' : 'h3';
    return (
      <Heading id={block.id} className="legal-section-heading">
        <Runs runs={block.content} />
      </Heading>
    );
  }
  if (block.kind === 'paragraph') {
    return (
      <p>
        <Runs runs={block.content} />
      </p>
    );
  }
  const List = block.ordered ? 'ol' : 'ul';
  return (
    <List className="legal-list">
      {block.items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Read-only generated legal text has no state or reorder interaction.
        <li key={index}>
          <Runs runs={item.content} />
          {item.children.length ? (
            <ul className="legal-list legal-list-nested">
              {item.children.map((child, childIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Read-only generated legal text has no state or reorder interaction.
                <li key={childIndex}>
                  <Runs runs={child} />
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
}: {
  document: LegalDocument;
  titleId?: string;
  showTitle?: boolean;
  sectionLevel?: 2 | 3;
}) {
  const { t } = useTranslation();
  return (
    <article className="legal-document" lang={document.locale}>
      {showTitle ? (
        <h1 id={titleId} className="legal-document-title">
          {document.title}
        </h1>
      ) : null}
      {document.status === 'draft' ? (
        <p className="legal-draft-badge">{t('legal.draftBadge')}</p>
      ) : null}
      {document.blocks.map((block, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Read-only generated legal text has no state or reorder interaction.
        <Block key={index} block={block} sectionLevel={sectionLevel} />
      ))}
    </article>
  );
}
