import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import {
  LEGAL_DOCUMENTS,
  type LegalDocumentId,
  legalDocumentIdForRoute,
} from '../legal/legalDocuments';
import {
  LegalDocumentView,
  type LegalInternalLinkRenderer,
} from './LegalDocumentView';
import { ShortTaskSheet } from './ShortTaskSheet';
import './LegalDocumentLink.css';

function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Inside a reading sheet a cross-reference opens a nested sheet, so the form
 * underneath keeps its input; other in-app links keep ordinary navigation.
 */
const renderSheetLink: LegalInternalLinkRenderer = ({ href, text }) => {
  const target = legalDocumentIdForRoute(href);
  return target ? (
    <LegalDocumentLink documentId={target}>{text}</LegalDocumentLink>
  ) : (
    <Link to={href}>{text}</Link>
  );
};

/** A legal text in a reading sheet, so the surrounding task keeps its state. */
export function LegalReadingSheet({
  documentId,
  open,
  onClose,
  restoreFocusRef,
}: {
  documentId: LegalDocumentId;
  open: boolean;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const entry = LEGAL_DOCUMENTS[documentId];
  return (
    <ShortTaskSheet
      open={open}
      title={t(entry.titleKey)}
      onClose={onClose}
      restoreFocusRef={restoreFocusRef}
      className="legal-reading-sheet"
      footer={
        <button type="button" className="secondary" onClick={onClose}>
          {t(entry.closeKey)}
        </button>
      }
    >
      <LegalDocumentView
        document={entry.document}
        showTitle={false}
        sectionLevel={3}
        renderInternalLink={renderSheetLink}
      />
    </ShortTaskSheet>
  );
}

/** A link to a legal text that opens it in place instead of leaving a task. */
export function LegalDocumentLink({
  documentId,
  children,
  className,
}: {
  documentId: LegalDocumentId;
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const entry = LEGAL_DOCUMENTS[documentId];
  return (
    <>
      <a
        ref={link}
        href={entry.route}
        className={className}
        onClick={(event) => {
          // A modified click keeps the browser's own new-tab/window handling.
          if (!isPlainClick(event)) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children ?? t(entry.linkKey)}
      </a>
      <LegalReadingSheet
        documentId={documentId}
        open={open}
        onClose={() => setOpen(false)}
        restoreFocusRef={link}
      />
    </>
  );
}

/** Quiet Cloud legal links for entry and More footers. */
export function LegalFooterLinks({
  className,
  inPlace = false,
}: {
  className: string;
  /** Open the texts in reading sheets, for surfaces that hold a form. */
  inPlace?: boolean;
}) {
  const { t } = useTranslation();
  const ids = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentId[];
  return (
    <nav className={className} aria-label={t('legal.eyebrow')}>
      {ids.map((id, index) => (
        <span key={id} className="legal-footer-item">
          {index > 0 ? (
            <span className="legal-footer-separator" aria-hidden="true">
              ·
            </span>
          ) : null}
          {inPlace ? (
            <LegalDocumentLink documentId={id} />
          ) : (
            <Link to={LEGAL_DOCUMENTS[id].route}>
              {t(LEGAL_DOCUMENTS[id].linkKey)}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
