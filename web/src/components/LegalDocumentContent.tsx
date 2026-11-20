import { type ComponentProps, useLayoutEffect } from 'react';
import type { LegalDocumentId } from '../legal/legalDocuments';
import { LEGAL_DOCUMENT_TEXTS } from '../legal/legalDocumentTexts';
import { LegalDocumentView } from './LegalDocumentView';

/**
 * A legal text from the on-demand legal chunk. `onShown` runs once the text is
 * in the document, for example to move focus to its title.
 */
export function LegalDocumentContent({
  documentId,
  onShown,
  ...viewProps
}: Omit<ComponentProps<typeof LegalDocumentView>, 'document'> & {
  documentId: LegalDocumentId;
  onShown?: () => void;
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: Runs once when the text first appears.
  useLayoutEffect(() => {
    onShown?.();
  }, []);
  return (
    <LegalDocumentView
      document={LEGAL_DOCUMENT_TEXTS[documentId]}
      {...viewProps}
    />
  );
}
