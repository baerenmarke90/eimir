import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';
import './MediaActionGroup.css';

/** A single shared boundary for device, external-source and voice intake. */
export function MediaActionGroup({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="media-action-group">
      <p className="media-action-group-label">{t('photoSources.mediaLabel')}</p>
      {children}
    </div>
  );
}
