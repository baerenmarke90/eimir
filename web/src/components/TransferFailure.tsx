import type { TransferFailureId } from '../client/transferFailure';
import { useTranslation } from '../i18n';

/**
 * A failed Transfer export or import, named in the person's words (#2173).
 * It reuses the error callout of the import states; the server code never
 * reaches the screen.
 */
export function TransferFailure({ id }: { id: TransferFailureId }) {
  const { t } = useTranslation();
  return (
    <div className="transfer-callout" data-tone="error" role="status">
      <strong>{t(`transfer.failure.${id}.title`)}</strong>
      <span>{t(`transfer.failure.${id}.body`)}</span>
    </div>
  );
}
