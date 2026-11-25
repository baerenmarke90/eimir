/**
 * The chosen memory world of Momente › Erinnerungen (#2283) for an
 * alternative to the Story presentation. It builds the world's entries from
 * the rediscovery selection (lead first), keeps memories with a sensitive
 * cover out unless this device chose to show them, and renders the world.
 * The Momentwolke shows the whole loaded diary: `moreItems` follow the
 * selection there, without duplicates.
 */
import { useMemo } from 'react';
import type { StoryItem } from '../../api/generated/models/StoryItem';
import { resolvedLocale, useTranslation } from '../../i18n';
import {
  buildMemoryWorldEntries,
  type LoadMemoryImage,
  type OpenMemoryWorldItem,
} from './model';
import { MomentCloudWorld } from './MomentCloudWorld';
import { PhotoBoothWorld } from './PhotoBoothWorld';
import { RecordCrateWorld } from './RecordCrateWorld';
import { StackWorld } from './StackWorld';
import { useShowSensitiveInWorlds } from './sensitivePreference';
import './MemoryWorld.css';

export type MemoryWorldViewWorld = 'stack' | 'crate' | 'cloud' | 'booth';

export interface MemoryWorldViewProps {
  world: MemoryWorldViewWorld;
  lead: StoryItem | null;
  leadKicker: string;
  leadHeadline: string;
  items: StoryItem[];
  /**
   * The rest of the loaded diary, merged after the lead and `items` without
   * duplicates. Used only by the Momentwolke (`world === 'cloud'`).
   */
  moreItems?: StoryItem[];
  loadMemoryImage: LoadMemoryImage;
  onOpen: OpenMemoryWorldItem;
  nicknameFor?: (accountId: string) => string | null;
}

export function MemoryWorldView({
  world,
  lead,
  leadKicker,
  leadHeadline,
  items,
  moreItems,
  loadMemoryImage,
  onOpen,
  nicknameFor,
}: MemoryWorldViewProps) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const showSensitive = useShowSensitiveInWorlds();
  // Duplicates of the lead and the selection are dropped while building.
  const worldItems = useMemo(
    () =>
      world === 'cloud' && moreItems?.length ? [...items, ...moreItems] : items,
    [world, items, moreItems],
  );
  const entries = useMemo(
    () =>
      buildMemoryWorldEntries({
        lead,
        leadHeadline,
        items: worldItems,
        showSensitive,
        t,
        locale,
        nicknameFor,
      }),
    [lead, leadHeadline, worldItems, showSensitive, t, locale, nicknameFor],
  );
  const props = {
    entries,
    kicker: leadKicker,
    loadMemoryImage,
    onOpen,
  };
  return (
    <div className="memory-world" data-world={world}>
      {world === 'crate' ? (
        <RecordCrateWorld {...props} />
      ) : world === 'cloud' ? (
        <MomentCloudWorld {...props} />
      ) : world === 'booth' ? (
        <PhotoBoothWorld {...props} />
      ) : (
        <StackWorld {...props} />
      )}
    </div>
  );
}
