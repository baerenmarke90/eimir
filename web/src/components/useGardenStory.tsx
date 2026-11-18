/**
 * The couple's story in the shared garden (#1907 H3 follow-up), gathered in
 * one hook so the garden page only needs a few hook-in points:
 * - Milestones grow as special plants in the memory corner. They are read
 *   through the existing Story path (`useStoryMilestones`), with the same
 *   authorization as everywhere else; a failed or empty read leaves the
 *   garden unchanged.
 * - Visitors leave small finds, which glint once and wait in the book.
 * - Rare visitors come at special times and react to a tap.
 * - "Euer Gartenjahr" replays the garden in a dialog.
 * - Optional sounds and, in the native app, a light vibration.
 */

import { useQuery } from '@tanstack/react-query';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GardenView } from '../api/generated/models/GardenView';
import { gardenWidth } from '../client/garden';
import {
  type GardenFeedback,
  useGardenFeedback,
} from '../client/gardenFeedback';
import {
  type GardenAnimal,
  POND,
  shownStage,
  unlockedWidth,
} from '../client/gardenGrowth';
import {
  keepsakeStoreKey,
  readSeenKeepsakes,
  saveSeenKeepsakes,
} from '../client/gardenKeepsakeStore';
import {
  foundKeepsakes,
  type Keepsake,
  keepsakeToReveal,
  memoryCorner,
  memoryPlants,
  type RareVisitor,
  rareVisitors,
} from '../client/gardenStory';
import type { MilestoneRef } from '../client/storyWaymarks';
import { useTranslation } from '../i18n';
import { GardenFeedbackSettings } from './GardenFeedbackSettings';
import { GardenKeepsakesBookSection, KeepsakeSparkle } from './GardenKeepsakes';
import {
  GardenPlayback,
  GardenPlaybackAction,
  type PlaybackPlant,
} from './GardenPlayback';
import { useRareVisitors } from './GardenRareVisitors';
import {
  GardenStoryBookSection,
  MemoryPlantCard,
  useMemoryCorner,
} from './GardenStory';
import { useStoryMilestones } from './RelationshipStoryExtras';

const SPARKLE_MS = 3200;

export interface GardenStory {
  scene: {
    back: ReactNode;
    meadow: ReactNode;
    pond: ReactNode;
    front: ReactNode;
    targets: ReactNode;
  };
  /** The card of a tapped Milestone plant. */
  card: ReactNode;
  /** The book's story sections, finds, replay action and settings. */
  book: ReactNode;
  /** The status line for a new find; separate from the visitor reactions. */
  note: ReactNode;
  /** The replay dialog while it is open. */
  dialog: ReactNode;
  feedback: GardenFeedback;
  /** Call from a visitor's tap reaction: it may leave a find there. */
  reactToVisitor: (kind: GardenAnimal, at: { x: number; y: number }) => void;
  closeMemory: () => void;
}

export function useGardenStory({
  garden,
  apiBaseUrl,
  accessToken,
  spaceId,
  accountId,
  loadMilestones,
  live,
  reduced,
  visitors,
  visitorName,
  onSelectMemory,
  onStatus,
}: {
  garden: GardenView | undefined;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
  /** Tests read Milestones from here instead of the API. */
  loadMilestones?: () => Promise<MilestoneRef[]>;
  /** False when the page runs with injected services (tests). */
  live: boolean;
  reduced: boolean;
  /** False while nobody may visit (for example a sleeping garden). */
  visitors: boolean;
  /** The visitor as the status line names it ("Eure Schnecke" or its name). */
  visitorName: (kind: GardenAnimal) => string;
  /** A tapped Milestone plant replaces a selected plant's story card. */
  onSelectMemory: () => void;
  onStatus: (text: string) => void;
}): GardenStory {
  const { t } = useTranslation();
  const feedback = useGardenFeedback(accountId);
  const liveMilestones = useStoryMilestones(
    { apiBaseUrl, accessToken, accountId, spaceId },
    { enabled: live },
  );
  const injected = useQuery({
    queryKey: ['games', 'garden', 'milestones', accountId, spaceId],
    queryFn: async () => (await loadMilestones?.()) ?? [],
    enabled: !live && loadMilestones !== undefined,
    retry: false,
  });
  const milestones = live ? liveMilestones : (injected.data ?? []);

  const localDate = garden?.localDate ?? new Date();
  const unlocks = garden?.unlocks ?? [];
  const sharedDays = garden?.sharedDays ?? 0;
  const highest = (garden?.plants ?? []).reduce(
    (max, entry) => (entry.inPond ? max : Math.max(max, entry.slot ?? 0)),
    0,
  );
  const width = gardenWidth(highest, unlockedWidth(unlocks));

  /* Milestones as plants ----------------------------------------------------- */
  const corner = useMemo(
    () => memoryCorner(memoryPlants(milestones, localDate)),
    [milestones, localDate],
  );
  const [memoryId, setMemoryId] = useState<string | null>(null);
  const memory = corner.find((plant) => plant.id === memoryId) ?? null;
  const memoryScene = useMemoryCorner({
    plants: corner,
    selectedId: memory?.id ?? null,
    onSelect: (id) => {
      feedback.buzz('tap');
      onSelectMemory();
      setMemoryId((current) => (current === id ? null : id));
    },
  });

  /* Finds -------------------------------------------------------------------- */
  const found = useMemo(
    () => foundKeepsakes(spaceId, sharedDays),
    [spaceId, sharedDays],
  );
  const storeKey = keepsakeStoreKey(accountId, spaceId);
  const seen = useRef<Set<Keepsake> | null>(null);
  const [sparkle, setSparkle] = useState<{
    keepsake: Keepsake;
    x: number;
    y: number;
    key: number;
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const sparkleTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (sparkleTimer.current !== null)
        window.clearTimeout(sparkleTimer.current);
    },
    [],
  );
  const reactToVisitor = useCallback(
    (kind: GardenAnimal, at: { x: number; y: number }) => {
      feedback.buzz('reaction');
      if (kind === 'ducks') feedback.play('quack');
      seen.current ??= readSeenKeepsakes(storeKey);
      const keepsake = keepsakeToReveal(found, seen.current);
      if (!keepsake) return;
      // The latest find glints; older unseen ones simply wait in the book.
      for (const item of found) seen.current.add(item);
      saveSeenKeepsakes(storeKey, seen.current);
      // The ducks leave their find on the shore, the others where they stand.
      const y = kind === 'ducks' ? POND.cy + POND.ry + 6 : at.y + 4;
      setSparkle({ keepsake, x: at.x, y, key: Date.now() });
      setNote(
        t(`games.garden.story.keepsakeLeft.${keepsake}`, {
          visitor: visitorName(kind),
        }),
      );
      feedback.play('chime');
      if (sparkleTimer.current !== null)
        window.clearTimeout(sparkleTimer.current);
      sparkleTimer.current = window.setTimeout(
        () => setSparkle(null),
        SPARKLE_MS,
      );
    },
    [feedback, found, storeKey, t, visitorName],
  );

  /* Rare visitors ------------------------------------------------------------ */
  const hour = new Date().getHours();
  const rare = useMemo(
    () =>
      visitors && garden
        ? rareVisitors({ spaceId, localDate, hour, unlocks })
        : [],
    [visitors, garden, spaceId, localDate, hour, unlocks],
  );
  const rareScene = useRareVisitors({
    visitors: rare,
    width,
    unlocks,
    onReaction: (visitor: RareVisitor) => {
      feedback.buzz('reaction');
      if (visitor === 'owl') feedback.play('hoot');
      if (visitor === 'ducklings') feedback.play('quack');
      onStatus(t(`games.garden.story.rare.${visitor}.reaction`));
    },
  });

  /* Replay ------------------------------------------------------------------- */
  const [playing, setPlaying] = useState(false);
  const playbackPlants: PlaybackPlant[] = useMemo(
    () =>
      (garden?.plants ?? []).map((entry) => ({
        id: entry.id,
        species: entry.species,
        slot: entry.slot ?? 0,
        inPond: entry.inPond === true,
        role: entry.senderId === accountId ? 'own' : 'partner',
        stage: shownStage(entry.species, entry.stage, localDate),
        watered: false,
        label: t(`games.garden.species.${entry.species}.name`),
        sentOn: entry.sentOn,
      })),
    [garden?.plants, accountId, localDate, t],
  );

  return {
    scene: {
      back: rareScene.back,
      meadow: memoryScene.art,
      pond: rareScene.pond,
      front: sparkle ? (
        <KeepsakeSparkle
          key={sparkle.key}
          keepsake={sparkle.keepsake}
          x={sparkle.x}
          y={sparkle.y}
        />
      ) : null,
      targets: (
        <>
          {memoryScene.targets}
          {rareScene.targets}
        </>
      ),
    },
    card: memory ? (
      <MemoryPlantCard plant={memory} onClose={() => setMemoryId(null)} />
    ) : null,
    book: (
      <>
        <GardenStoryBookSection plants={corner} />
        <GardenKeepsakesBookSection found={found} />
        {garden && garden.plants.length > 0 ? (
          <GardenPlaybackAction onPlay={() => setPlaying(true)} />
        ) : null}
        <GardenFeedbackSettings feedback={feedback} />
      </>
    ),
    note: (
      <p
        className="garden-keepsake-note"
        role="status"
        aria-live="polite"
        data-testid="garden-keepsake-note"
      >
        {note}
      </p>
    ),
    dialog:
      playing && garden ? (
        <GardenPlayback
          plants={playbackPlants}
          unlocks={unlocks}
          form={garden.form ?? 'BED'}
          sharedDays={sharedDays}
          localDate={localDate}
          width={width}
          reduced={reduced}
          onClose={() => setPlaying(false)}
        />
      ) : null,
    feedback,
    reactToVisitor,
    closeMemory: () => setMemoryId(null),
  };
}
