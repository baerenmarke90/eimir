/**
 * The chosen memory world of Momente › Erinnerungen (#2283) for an
 * alternative to the Story presentation. It builds the world's entries from
 * the rediscovery selection (lead first), keeps memories with a sensitive
 * cover out unless this device chose to show them, and renders the world.
 */
import { useMemo } from 'react';
import type { StoryItem } from '../../api/generated/models/StoryItem';
import { resolvedLocale, useTranslation } from '../../i18n';
import {
  buildMemoryWorldEntries,
  type LoadMemoryImage,
  type OpenMemoryWorldItem,
} from './model';
import { RecordCrateWorld } from './RecordCrateWorld';
import { StackWorld } from './StackWorld';
import { useShowSensitiveInWorlds } from './sensitivePreference';
import './MemoryWorld.css';

export type MemoryWorldViewWorld = 'stack' | 'crate';

export interface MemoryWorldViewProps {
  world: MemoryWorldViewWorld;
  lead: StoryItem | null;
  leadKicker: string;
  leadHeadline: string;
  items: StoryItem[];
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
  loadMemoryImage,
  onOpen,
  nicknameFor,
}: MemoryWorldViewProps) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const showSensitive = useShowSensitiveInWorlds();
  const entries = useMemo(
    () =>
      buildMemoryWorldEntries({
        lead,
        leadHeadline,
        items,
        showSensitive,
        t,
        locale,
        nicknameFor,
      }),
    [lead, leadHeadline, items, showSensitive, t, locale, nicknameFor],
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
      ) : (
        <StackWorld {...props} />
      )}
    </div>
  );
}
