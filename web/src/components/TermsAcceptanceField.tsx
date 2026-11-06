import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
} from 'react';
import { LEGAL_TERMS_ROUTE } from '../client/routes';
import { Trans, useTranslation } from '../i18n';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';
import { LegalDocumentView } from './LegalDocumentView';
import { ShortTaskSheet } from './ShortTaskSheet';
import './TermsAcceptanceField.css';

/** The bundled text a person reads is the text whose version they accept. */
export const BUNDLED_TERMS_VERSION = termsOfUseDe.version;

function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** Terms text in a reading sheet, so the surrounding form keeps its input. */
export function TermsReadingSheet({
  open,
  onClose,
  restoreFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  return (
    <ShortTaskSheet
      open={open}
      title={t('legal.termsSheetTitle')}
      onClose={onClose}
      restoreFocusRef={restoreFocusRef}
      className="legal-terms-sheet"
      footer={
        <button type="button" className="secondary" onClick={onClose}>
          {t('legal.sheetClose')}
        </button>
      }
    >
      <LegalDocumentView
        document={termsOfUseDe}
        showTitle={false}
        sectionLevel={3}
      />
    </ShortTaskSheet>
  );
}

/** A link to the terms that opens them in place instead of leaving a task. */
export function TermsLink({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  return (
    <>
      <a
        ref={link}
        href={LEGAL_TERMS_ROUTE}
        className={className}
        onClick={(event) => {
          if (!isPlainClick(event)) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children ?? t('legal.termsLink')}
      </a>
      <TermsReadingSheet
        open={open}
        onClose={() => setOpen(false)}
        restoreFocusRef={link}
      />
    </>
  );
}

/** Required acceptance row for forms that may create a Cloud Account. */
export function TermsAcceptanceField({
  name = 'acceptedTerms',
}: {
  name?: string;
}) {
  return (
    <label className="choice-row terms-acceptance">
      <input type="checkbox" name={name} value="accepted" required />
      <span>
        <Trans
          i18nKey="legal.accept"
          components={{ termsLink: <TermsLink /> }}
        />
      </span>
    </label>
  );
}
