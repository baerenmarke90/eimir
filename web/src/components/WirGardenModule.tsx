import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from 'react';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { GamesApi } from '../api/generated/apis/GamesApi';
import type { GardenView } from '../api/generated/models/GardenView';
import { gardenQueryKey, gardenWidth } from '../client/garden';
import { shownStage, unlockedWidth } from '../client/gardenGrowth';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { GAMES_GARDEN_ROUTE } from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
  withdrawSpaceCapability,
} from '../client/spaceEntitlement';
import { useAmbientRest } from '../client/useAmbientRest';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { GAMES_COUPLE_CAPABILITY } from './GamesProductArea';
import { useGardenClock } from './GardenAmbience';
import { useGardenPresentation } from './GardenPresentation';
import { GardenScene, type ScenePlant } from './GardenScene';
import { TodayDestinationLink } from './TodayDestinationLink';
import './GardenGamePage.css';
import './GardenGrowth.css';
import './WirGardenModule.css';

type Translate = ReturnType<typeof useTranslation>['t'];

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener?.('change', listener);
  return () => query?.removeEventListener?.('change', listener);
}

/** Follows the system setting live, so the idle scene stops at once. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCED_MOTION).matches === true,
    () => true,
  );
}

/**
 * One gentle sentence about the garden today, from existing garden wording
 * where it exists. It names what happened, never what is missing: no
 * counters, streaks or reminders of a skipped day.
 */
export function wirGardenStatus(
  garden: GardenView,
  partnerName: string,
  t: Translate,
): string {
  if (garden.incoming) {
    return t('games.garden.arrivedTitle', { name: partnerName });
  }
  if (garden.bouquet) {
    return t('games.garden.growth.bouquetTitle', { name: partnerName });
  }
  if (garden.reunionToday) return t('games.garden.reunion.todayTitle');
  if (garden.sleeping) return t('games.garden.wir.resting');
  if (garden.sharedToday) return t('games.garden.sharedTitle');
  if (garden.wateredToday && garden.partnerWateredToday) {
    return t('games.garden.wir.bothWatered');
  }
  const partnerWatered = garden.plants.find(
    (plant) => plant.id === garden.partnerWateredToday,
  );
  if (partnerWatered) {
    return t('games.garden.partnerWatered', {
      name: partnerName,
      species: t(`games.garden.species.${partnerWatered.species}.name`),
    });
  }
  if (garden.sentToday) {
    return t('games.garden.waitingTitle', { name: partnerName });
  }
  if (garden.plants.length === 0) return t('games.garden.wir.empty');
  return t(`games.garden.growth.forms.${garden.form ?? 'BED'}`);
}

function isEntitlementRequired(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.kind === 'permission' &&
    error.code === 'PREMIUM_ENTITLEMENT_REQUIRED'
  );
}

/**
 * The optional Wir module (Product Owner 2026-11-17: show the garden on Wir
 * for those who want it): the couple's shared garden as a calm,
 * read-only picture that leads into the game.
 *
 * - Off by default; `visible` is the person's own Wir choice.
 * - Premium (`games.couple`): without the capability nothing renders and no
 *   garden read is made. A saved choice survives a downgrade.
 * - Reads the same authorized garden resource with the same query key as the
 *   game, so both share one cache entry. Unlike the game it does not poll;
 *   Today's normal freshness applies.
 */
export function WirGardenModule({
  gamesApi,
  entitlementApi,
  accountId,
  spaceId,
  partnerName,
  visible,
}: {
  gamesApi: Pick<GamesApi, 'getGarden'>;
  entitlementApi: EntitlementsApi;
  accountId: string;
  spaceId: string;
  partnerName: string;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const headingId = useId();
  const statusId = useId();
  const reduced = useReducedMotion();
  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlementApi, spaceId),
    [entitlementApi, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const games = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    enabled: visible,
    capability: GAMES_COUPLE_CAPABILITY,
  });
  const allowed = visible && games.data === true && !games.isError;
  const gardenQuery = useQuery({
    queryKey: gardenQueryKey(accountId, spaceId),
    queryFn: async ({ signal }) => {
      try {
        return await gamesApi.getGarden({ spaceId }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: allowed,
    retry: false,
    staleTime: 60_000,
  });
  const denied = isEntitlementRequired(gardenQuery.error);
  useEffect(() => {
    if (!denied) return;
    withdrawSpaceCapability(
      queryClient,
      accountId,
      spaceId,
      GAMES_COUPLE_CAPABILITY,
    );
  }, [accountId, denied, queryClient, spaceId]);

  // The one-shot wake and falling leaves belong to the game; Wir shows the
  // garden as it is.
  const presentation = useGardenPresentation(gardenQuery.data, true);
  // #2048: sun or moon follow the device clock here too, not the theme.
  const clock = useGardenClock();
  // The preview is decoration on a page people leave open: its motion plays
  // only while seen and only briefly, then rests in place (#2063).
  const frameRef = useRef<HTMLDivElement>(null);
  const resting = useAmbientRest(
    frameRef,
    allowed && Boolean(gardenQuery.data) && !reduced,
  );

  if (!allowed) return null;
  const garden = gardenQuery.data;
  if (!garden) {
    return gardenQuery.isPending ? (
      <div
        className="today-module-placeholder"
        data-kind="shared-garden"
        aria-hidden="true"
      />
    ) : null;
  }

  const unlocks = garden.unlocks ?? [];
  const highest = garden.plants.reduce(
    (max, plant) => (plant.inPond ? max : Math.max(max, plant.slot ?? 0)),
    0,
  );
  const width = gardenWidth(highest, unlockedWidth(unlocks));
  const title = garden.name ?? t('games.garden.title');
  const plants: ScenePlant[] = garden.plants.map((plant) => ({
    id: plant.id,
    species: plant.species,
    slot: plant.slot ?? 0,
    inPond: plant.inPond === true,
    role: plant.senderId === accountId ? 'own' : 'partner',
    stage: presentation.stageOf(
      shownStage(plant.species, plant.stage, garden.localDate),
    ).stage,
    watered:
      garden.wateredToday === plant.id ||
      garden.partnerWateredToday === plant.id,
    label: '',
  }));

  return (
    <section
      className="today-section today-section-garden"
      aria-labelledby={headingId}
    >
      <TodayDestinationLink
        to={GAMES_GARDEN_ROUTE}
        className="wir-garden-card"
        ariaLabel={t('games.garden.wir.openAria', { title })}
        ariaDescribedBy={statusId}
        selectedKey="wir-shared-garden"
      >
        <div className="garden-game-page wir-garden-stage">
          <div
            ref={frameRef}
            className="garden-frame wir-garden-frame"
            data-season={presentation.season}
            data-sleep={presentation.sleep}
            data-daytime={clock.daytime}
            data-resting={resting ? 'true' : undefined}
          >
            <GardenScene
              variant="preview"
              plants={plants}
              width={width}
              selectedId={null}
              watering={false}
              onSelect={() => undefined}
              gustKey={0}
              celebrationKey={0}
              lively={!reduced}
              label={title}
              layers={presentation.layers(width)}
              growth={{
                unlocks,
                sharedDays: garden.sharedDays ?? 0,
                fresh: new Set(),
                // Calm on Wir: the visitors stay in the game.
                visitors: false,
                reduced,
                labels: { animal: () => '', quack: '' },
              }}
            />
          </div>
        </div>
        <div className="wir-garden-copy">
          <h2 id={headingId} className="today-section-title wir-garden-title">
            {title}
          </h2>
          <span id={statusId} className="wir-garden-status">
            {wirGardenStatus(garden, partnerName, t)}
          </span>
        </div>
        <EimirIcon name="chevron-right" />
      </TodayDestinationLink>
    </section>
  );
}
