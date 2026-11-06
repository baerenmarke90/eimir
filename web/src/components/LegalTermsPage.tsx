import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';
import { LegalDocumentView } from './LegalDocumentView';
import { TaskBackButton } from './TaskBackButton';
import './LegalTermsPage.css';

/** Public reading page; it needs no session and works from the app bundle. */
export function LegalTermsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('legal.termsSheetTitle')} · eimir.`;
    return () => {
      document.title = previous;
    };
  }, [t]);

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
        <LegalDocumentView document={termsOfUseDe} titleId="legal-page-title" />
      </div>
    </main>
  );
}
