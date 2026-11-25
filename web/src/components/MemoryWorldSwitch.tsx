import { Link } from 'react-router-dom';
import type { MemoryWorld } from '../client/memoryWorld';
import { settingsCategoryPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { MEMORY_WORLD_SETTINGS_ANCHOR } from './MemoryWorldSettings';
import { WorldArt } from './memoryWorlds/WorldArt';
import './MemoryWorldSwitch.css';

/**
 * The quiet "Welt wechseln" entry above Momente › Erinnerungen (#2283): names
 * the current world with its small illustration and leads to the setting.
 */
export function MemoryWorldSwitch({ world }: { world: MemoryWorld }) {
  const { t } = useTranslation();
  return (
    <div className="memory-world-switch">
      <Link
        to={`${settingsCategoryPath('appearance')}#${MEMORY_WORLD_SETTINGS_ANCHOR}`}
        aria-label={t('memoryWorldSettings.switchWorldCurrent', {
          name: t(`memoryWorldSettings.worlds.${world}.name`),
        })}
      >
        <span className="memory-world-switch-art" aria-hidden="true">
          <WorldArt world={world} />
        </span>
        {t('memoryWorldSettings.switchWorld')}
      </Link>
    </div>
  );
}
