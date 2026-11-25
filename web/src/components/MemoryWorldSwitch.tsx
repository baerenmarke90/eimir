import { Link } from 'react-router-dom';
import type { MemoryWorld } from '../client/memoryWorld';
import { settingsCategoryPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { MEMORY_WORLD_SETTINGS_ANCHOR } from './MemoryWorldSettings';
import { MEMORY_WORLD_TOOLBAR_SLOT_ID } from './memoryWorlds/toolbarSlot';
import { WorldArt } from './memoryWorlds/WorldArt';
import './MemoryWorldSwitch.css';

export { MEMORY_WORLD_TOOLBAR_SLOT_ID };

/**
 * The quiet "Welt wechseln" entry above Momente › Erinnerungen (#2283): names
 * the current world with its small illustration and leads to the setting.
 * The empty slot before it takes a world's own small controls (the
 * Fotoautomat portals its style switch there).
 */
export function MemoryWorldSwitch({ world }: { world: MemoryWorld }) {
  const { t } = useTranslation();
  return (
    <div className="memory-world-switch">
      <div
        id={MEMORY_WORLD_TOOLBAR_SLOT_ID}
        className="memory-world-switch-slot"
      />
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
