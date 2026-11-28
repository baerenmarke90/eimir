import { Link } from 'react-router-dom';
import type { MemoryWorld } from '../client/memoryWorld';
import { settingsCategoryPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { MEMORY_WORLD_SETTINGS_ANCHOR } from './MemoryWorldSettings';
import { WorldArt } from './memoryWorlds/WorldArt';
import './MemoryWorldSwitch.css';

/**
 * The quiet "Welt wechseln" entry of Momente › Erinnerungen (#2283): a round
 * picture of the current world at the end of the world's top row (next to
 * its heading, or next to the Story theme circles). It leads to the setting
 * and names the current world for assistive technology.
 */
export function MemoryWorldSwitch({ world }: { world: MemoryWorld }) {
  const { t } = useTranslation();
  return (
    <Link
      className="memory-world-switch"
      to={`${settingsCategoryPath('appearance')}#${MEMORY_WORLD_SETTINGS_ANCHOR}`}
      aria-label={t('memoryWorldSettings.switchWorldCurrent', {
        name: t(`memoryWorldSettings.worlds.${world}.name`),
      })}
    >
      <span className="memory-world-switch-art" aria-hidden="true">
        <WorldArt world={world} />
      </span>
    </Link>
  );
}
