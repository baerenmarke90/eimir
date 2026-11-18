import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './SettingsScopeNote.css';

/**
 * Says whose a settings page is, with a short consequence line. The chip
 * never carries the meaning by colour alone: icon and text always appear.
 */
export function SettingsScopeNote({ scope }: { scope: 'shared' | 'personal' }) {
  const { t } = useTranslation();
  const shared = scope === 'shared';
  return (
    <p className={`settings-scope-note is-${scope}`}>
      <span className="settings-scope-chip">
        <EimirIcon name={shared ? 'wir' : 'profil'} />
        {t(
          shared
            ? 'profileIdentity.scopeShared'
            : 'profileIdentity.scopePersonal',
        )}
      </span>
      <span className="settings-scope-hint">
        {t(
          shared
            ? 'profileIdentity.scopeSharedHint'
            : 'profileIdentity.scopePersonalHint',
        )}
      </span>
    </p>
  );
}
