import { createContext, type ReactNode, useContext } from 'react';
import type { MemoryWorld } from '../../client/memoryWorld';
import { MemoryWorldSwitch } from '../MemoryWorldSwitch';

/**
 * The world shown in Momente › Erinnerungen (#2283). Set by the page that
 * hosts the worlds; without it (other surfaces, unit tests) a world's head
 * shows no switch.
 */
const WorldSwitchContext = createContext<MemoryWorld | null>(null);

export const WorldSwitchProvider = WorldSwitchContext.Provider;

/** The round "Welt wechseln" entry for the current world, if there is one. */
export function WorldSwitchEntry() {
  const world = useContext(WorldSwitchContext);
  return world ? <MemoryWorldSwitch world={world} /> : null;
}

/**
 * The top row of a memory world: its heading, optional quiet extras (the
 * Stapel's position) and, at the end, the round "Welt wechseln" entry.
 */
export function WorldHead({
  heading,
  children,
}: {
  heading: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="memory-world-head">
      <h2>{heading}</h2>
      {children}
      <WorldSwitchEntry />
    </div>
  );
}
