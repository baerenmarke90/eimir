import { LEGAL_PRIVACY_ROUTE, LEGAL_TERMS_ROUTE } from '../client/routes';

export type LegalDocumentId = 'terms' | 'privacy';

type LegalDocumentEntry = {
  route: string;
  /** Reading title of the sheet and the browser tab. */
  titleKey: string;
  /** Short label for footer links. */
  linkKey: string;
  closeKey: string;
};

/**
 * The eimir. Cloud legal documents the Web app delivers from its bundle. The
 * texts themselves live in `legalDocumentTexts`, a chunk that loads on demand
 * so they stay out of the startup bundle.
 */
export const LEGAL_DOCUMENTS: Readonly<
  Record<LegalDocumentId, LegalDocumentEntry>
> = {
  terms: {
    route: LEGAL_TERMS_ROUTE,
    titleKey: 'legal.termsSheetTitle',
    linkKey: 'legal.termsLink',
    closeKey: 'legal.sheetClose',
  },
  privacy: {
    route: LEGAL_PRIVACY_ROUTE,
    titleKey: 'legal.privacySheetTitle',
    linkKey: 'legal.privacyLink',
    closeKey: 'legal.privacySheetClose',
  },
};

/** Return the legal document a public route shows, if any. */
export function legalDocumentIdForRoute(
  pathname: string,
): LegalDocumentId | null {
  for (const [id, entry] of Object.entries(LEGAL_DOCUMENTS)) {
    if (entry.route === pathname) return id as LegalDocumentId;
  }
  return null;
}

/**
 * Cloud publishes the terms version new Accounts accept; Self-Hosted publishes
 * none because its operator provides its own legal texts. The same signal
 * decides whether the Cloud privacy policy applies.
 */
export function cloudLegalDocumentsApply(
  termsOfUseVersion: string | null | undefined,
): boolean {
  return Boolean(termsOfUseVersion);
}
