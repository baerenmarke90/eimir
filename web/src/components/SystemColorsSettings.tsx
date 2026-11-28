/**
 * The device-local "System colours" switch (Android Material You).
 *
 * Shown only in the native Android app on a device that reports a dynamic
 * palette; the visibility follows the runtime platform, never the viewport
 * width (AGENTS.md, browser-only and native-only controls). Off by default,
 * stored on this device only, never shared with the partner or the server.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  deriveSystemAccent,
  readSystemPalette,
  setSystemColorsEnabled,
  subscribeSystemColorsEnabled,
  systemColorsEnabled,
} from '../client/systemColors';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';

type Availability = 'checking' | 'unavailable' | 'unsuitable' | 'ready';

export function SystemColorsSettings() {
  const { t } = useTranslation();
  const enabled = useSyncExternalStore(
    subscribeSystemColorsEnabled,
    systemColorsEnabled,
    systemColorsEnabled,
  );
  const [availability, setAvailability] = useState<Availability>('checking');
  useEffect(() => {
    let current = true;
    void readSystemPalette().then((palette) => {
      if (!current) return;
      setAvailability(
        !palette?.available
          ? 'unavailable'
          : deriveSystemAccent(palette)
            ? 'ready'
            : 'unsuitable',
      );
    });
    return () => {
      current = false;
    };
  }, []);
  if (availability === 'checking' || availability === 'unavailable')
    return null;
  return (
    <section
      className="settings-section"
      aria-labelledby="system-colors-settings-title"
      data-testid="system-colors-settings"
    >
      <h2 id="system-colors-settings-title">{t('systemColors.title')}</h2>
      <PreferenceSwitch
        label={t('systemColors.label')}
        description={t(
          availability === 'ready'
            ? 'systemColors.hint'
            : 'systemColors.unsuitable',
        )}
        checked={enabled && availability === 'ready'}
        disabled={availability !== 'ready'}
        onCheckedChange={setSystemColorsEnabled}
      />
    </section>
  );
}
