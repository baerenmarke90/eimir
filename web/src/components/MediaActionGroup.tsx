import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';
import './MediaActionGroup.css';

/** A single shared boundary for device, external-source and voice intake. */
export function MediaActionGroup({
  children,
  unframed = false,
}: {
  children: ReactNode;
  unframed?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`media-action-group${unframed ? ' media-action-group--composer' : ''}`}
    >
      {!unframed ? (
        <p className="media-action-group-label">
          {t('photoSources.mediaLabel')}
        </p>
      ) : null}
      {children}
    </div>
  );
}
