import { useState } from 'react';
import { useTranslation } from '../i18n';
import { useWishShare } from '../client/useWishShare';
import { EimirIcon } from './EimirIcon';

/**
 * Self-contained "Share wish" control. Native uses the system chooser, a
 * browser uses Web Share when available and otherwise offers copying; the
 * copy label therefore never appears in the native app.
 */
export function WishShareAction({
  apiBaseUrl,
  wishId,
  className = 'button-link secondary',
}: {
  apiBaseUrl: string;
  wishId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { labelKey, share } = useWishShare(apiBaseUrl);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        setBusy(true);
        void share(wishId).finally(() => setBusy(false));
      }}
    >
      <EimirIcon name="external-link" />
      {t(busy ? 'wishShare.sharing' : labelKey)}
    </button>
  );
}
