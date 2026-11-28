import { useSyncExternalStore } from 'react';
import {
  subscribeSystemColorsActive,
  systemColorsActive,
} from '../client/systemColors';
import { useTranslation } from '../i18n';

/**
 * Shown on the settings whose colours the system colours currently replace.
 * Saving a change there switches the system colours off again.
 */
export function SystemColorsOverrideNote() {
  const { t } = useTranslation();
  const active = useSyncExternalStore(
    subscribeSystemColorsActive,
    systemColorsActive,
    systemColorsActive,
  );
  if (!active) return null;
  return (
    <p className="settings-section-intro" role="note">
      {t('systemColors.overrides')}
    </p>
  );
}
