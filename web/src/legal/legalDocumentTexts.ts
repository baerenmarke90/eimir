import { privacyPolicyDe } from '../i18n/locales/legalDocuments/privacyPolicy.de.generated';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';
import type { LegalDocument } from './legalDocument';
import type { LegalDocumentId } from './legalDocuments';

/**
 * The full legal texts. Only the on-demand legal content chunk imports them,
 * so they stay out of the startup bundle.
 */
export const LEGAL_DOCUMENT_TEXTS: Readonly<
  Record<LegalDocumentId, LegalDocument>
> = {
  terms: termsOfUseDe,
  privacy: privacyPolicyDe,
};
