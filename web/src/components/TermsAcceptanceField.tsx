import { Trans } from '../i18n';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';
import { LegalDocumentLink } from './LegalDocumentLink';
import './TermsAcceptanceField.css';

/** The bundled text a person reads is the text whose version they accept. */
export const BUNDLED_TERMS_VERSION = termsOfUseDe.version;

/**
 * Required acceptance row for forms that may create a Cloud Account, followed
 * by the privacy notice. The notice informs at the moment the address is
 * collected (Art. 13 GDPR); it is never accepted and never required, so it
 * stays outside the checkbox label and its accessible name.
 */
export function TermsAcceptanceField({
  name = 'acceptedTerms',
  checked,
  onChange,
}: {
  name?: string;
  /** Pass both to observe the choice, for example to enable a provider button. */
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <>
      <label className="choice-row terms-acceptance">
        <input
          type="checkbox"
          name={name}
          value="accepted"
          required
          {...(checked !== undefined && onChange
            ? {
                checked,
                onChange: (event) => onChange(event.currentTarget.checked),
              }
            : {})}
        />
        <span>
          <Trans
            i18nKey="legal.accept"
            components={{ termsLink: <LegalDocumentLink documentId="terms" /> }}
          />
        </span>
      </label>
      <p className="privacy-notice">
        <Trans
          i18nKey="legal.privacyNotice"
          components={{
            privacyLink: <LegalDocumentLink documentId="privacy" />,
          }}
        />
      </p>
    </>
  );
}
