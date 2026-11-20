/**
 * The device-local haptics switch (Motion Contract 4.10, #2076).
 *
 * Shown only in the native app: the Web has no haptics, and the visibility
 * follows the runtime platform, never the viewport width (AGENTS.md,
 * browser-only and native-only controls). On by default, stored on this
 * device only, never shared with the partner or sent to the server.
 */
import { useSyncExternalStore } from 'react';
import { useTranslation } from '../i18n';
import {
  hapticsAvailable,
  hapticsEnabled,
  setHapticsEnabled,
  subscribeHapticsEnabled,
} from '../motion/haptics';
import { PreferenceSwitch } from './PreferenceSwitch';

export function HapticsSettings() {
  const { t } = useTranslation();
  const enabled = useSyncExternalStore(
    subscribeHapticsEnabled,
    hapticsEnabled,
    hapticsEnabled,
  );
  if (!hapticsAvailable()) return null;
  return (
    <section
      className="settings-section"
      aria-labelledby="haptics-settings-title"
      data-testid="haptics-settings"
    >
      <h2 id="haptics-settings-title">{t('hapticsSettings.title')}</h2>
      <PreferenceSwitch
        label={t('hapticsSettings.label')}
        description={t('hapticsSettings.hint')}
        checked={enabled}
        onCheckedChange={setHapticsEnabled}
      />
    </section>
  );
}
