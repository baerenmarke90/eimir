import { useEffect } from 'react';
import { useNavigate, useNavigationType } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '../legal/legalDocuments';
import { LegalDocumentView } from './LegalDocumentView';
import { TaskBackButton } from './TaskBackButton';
import './LegalDocumentPage.css';

/** Public reading page; it needs no session and works from the app bundle. */
export function LegalDocumentPage({
  documentId,
}: {
  documentId: LegalDocumentId;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const entry = LEGAL_DOCUMENTS[documentId];

  // The page lives outside the app shell's route handoff. An in-app entry,
  // such as a footer link or a cross-reference, starts at the title; Back and
  // Forward keep the browser's own scroll restoration.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Runs once per document entry; App keys the page by document.
  useEffect(() => {
    if (navigationType === 'POP') return;
    window.scrollTo(0, 0);
    document.getElementById('legal-page-title')?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = `${t(entry.titleKey)} · eimir.`;
    return () => {
      document.title = previous;
    };
  }, [entry.titleKey, t]);

  function goBack() {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) navigate(-1);
    else navigate('/', { replace: true });
  }

  return (
    <main className="legal-page" aria-labelledby="legal-page-title">
      <div className="legal-page-column">
        <TaskBackButton shellDefault onClick={goBack} />
        <p className="eyebrow">{t('legal.eyebrow')}</p>
        <LegalDocumentView
          document={entry.document}
          titleId="legal-page-title"
        />
      </div>
    </main>
  );
}
