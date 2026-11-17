import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { GamesApi } from '../api/generated/apis/GamesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { GardenPlantView } from '../api/generated/models/GardenPlantView';
import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import type { GardenView } from '../api/generated/models/GardenView';
import type { GardenVisitor } from '../api/generated/models/GardenVisitor';
import type { GardenWords } from '../api/generated/models/GardenWords';
import { Configuration } from '../client/apiConfiguration';
import {
  GARDEN_WORDS,
  type GardenFlight,
  gardenFlight,
  gardenQueryKey,
  gardenWidth,
  stageChanges,
} from '../client/garden';
import {
  availableAnimals,
  cleanVisitorName,
  type GardenAnimal,
  isBlooming,
  shownStage,
  unlockedWidth,
  VISITOR_CODE,
  visitorNames,
  withVisitorName,
  wordsArriveByPlane,
} from '../client/gardenGrowth';
import { renderSvgPng } from '../client/gardenImage';
import {
  createMemoryWithReadyAttachments,
  uploadMemoryDraftAttachment,
} from '../client/memoryAttachmentDraft';
import { usePartnerDistanceLine } from '../client/partnerDistance';
import {
  createPartnerLocationApi,
  PARTNER_LOCATION_CAPABILITY,
  partnerLocationSettingsQueryKey,
} from '../client/partnerLocation';
import { normalizeClientError } from '../client/problemDetails';
import { createReferenceApis } from '../client/referenceFlow';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { resolvedLocale, useTranslation } from '../i18n';
import { Messenger, SeedIcon } from './GardenArt';
import { GardenBook, GardenNewsCard, GardenYearCard } from './GardenBook';
import {
  BouquetBindCard,
  type BouquetFlower,
  BouquetReceivedCard,
} from './GardenBouquet';
import {
  GardenReunionSoonCard,
  GardenReunionTodayCard,
  GardenSleepCard,
  gardenSceneSentences,
  type SaveGardenMoment,
  useGardenMomentSaver,
  useGardenPresentation,
} from './GardenPresentation';
import { GardenScene, type SceneGrowth, type ScenePlant } from './GardenScene';
import { GardenVisitors } from './GardenVisitors';
import { PageHeader } from './PageHeader';
import { useDistanceShortText } from './PartnerDistanceLine';
import { PersonIdentity } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './GardenGamePage.css';
import './GardenGrowth.css';

const FLIGHT_BASE_MS = 1400;

export interface GardenServices {
  load: () => Promise<GardenView>;
  send: (
    species: GardenSpecies,
    words: GardenWords | null,
  ) => Promise<GardenView>;
  plant: (seedId: string) => Promise<GardenView>;
  water: (plantId: string) => Promise<GardenView>;
  /** Saves the reunion garden as a Moment; defaults to the media path. */
  saveMoment?: SaveGardenMoment;
  /* Growth and life (#1907 H3, PR 3). */
  acknowledgeNews?: () => Promise<GardenView>;
  rename?: (name: string | null) => Promise<GardenView>;
  /** Names one visitor for both partners; `null` removes the name. */
  nameVisitor?: (
    animal: GardenVisitor,
    name: string | null,
  ) => Promise<GardenView>;
  giveBouquet?: (plantIds: string[]) => Promise<GardenView>;
  closeBouquet?: (bouquetId: string, kept: boolean) => Promise<GardenView>;
  saveToMoments?: (input: {
    title: string;
    body: string;
    image: Blob;
    fileName: string;
  }) => Promise<{ memoryId: string }>;
}

function localDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function useDefaultServices({
  apiBaseUrl,
  accessToken,
  spaceId,
  accountId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
}): GardenServices {
  return useMemo(() => {
    const api = new GamesApi(
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    return {
      load: () => api.getGarden({ spaceId }),
      send: (species, words) =>
        api.sendGardenSeed({ spaceId, gardenSeedInput: { species, words } }),
      plant: (seedId) => api.plantGardenSeed({ spaceId, seedId }),
      water: (plantId) =>
        api.waterGardenPlant({ spaceId, gardenWateringInput: { plantId } }),
      acknowledgeNews: () => api.acknowledgeGardenNews({ spaceId }),
      rename: (name) =>
        api.renameGarden({ spaceId, gardenNameInput: { name } }),
      nameVisitor: (animal, name) =>
        api.nameGardenVisitor({
          spaceId,
          animal,
          gardenVisitorNameInput: { name },
        }),
      giveBouquet: (plantIds) =>
        api.giveGardenBouquet({ spaceId, gardenBouquetInput: { plantIds } }),
      closeBouquet: (bouquetId, kept) =>
        api.closeGardenBouquet({
          spaceId,
          bouquetId,
          gardenBouquetCloseInput: { kept },
        }),
      // The existing Memory/media path; only on an explicit tap.
      saveToMoments: async ({ title, body, image, fileName }) => {
        const apis = createReferenceApis(apiBaseUrl, accessToken);
        const ready = await uploadMemoryDraftAttachment(
          apis,
          apiBaseUrl,
          accessToken,
          spaceId,
          new File([image], fileName, { type: 'image/png' }),
          undefined,
          fetch,
          { accountId },
        );
        const { memory } = await createMemoryWithReadyAttachments(
          apis,
          spaceId,
          { title, body, happenedOn: localDay() },
          [ready.attachmentId],
        );
        return { memoryId: memory.id };
      },
    };
  }, [accessToken, accountId, apiBaseUrl, spaceId]);
}

/** The messenger reads the existing server distance band and stores nothing. */
function useGardenFlight({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  enabled,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  enabled: boolean;
}): GardenFlight {
  const locationApi = useMemo(
    () => createPartnerLocationApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const entitlementApi = useMemo(
    () =>
      new EntitlementsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const load = useMemo(
    () => entitlementLoader(entitlementApi, spaceId),
    [entitlementApi, spaceId],
  );
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    load,
    capability: PARTNER_LOCATION_CAPABILITY,
  });
  const settings = useQuery({
    queryKey: partnerLocationSettingsQueryKey(accountId, spaceId),
    enabled: false,
  }).data as { available?: boolean } | undefined;
  const allowed =
    enabled && capability.data === true && settings?.available === true;
  const line = usePartnerDistanceLine({
    api: locationApi,
    accountId,
    spaceId,
    enabled: allowed,
  });
  return gardenFlight(allowed && !line.isError ? line.data : undefined);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** The two partners and the arc the messenger flies along. */
function FlightBand({
  names,
  flight,
  flying,
  distanceLabel,
  colour,
}: {
  names: { own: string; partner: string };
  flight: GardenFlight;
  flying: { direction: 'toPartner' | 'toMe'; key: number } | null;
  distanceLabel: string | null;
  colour: string;
}) {
  const traveller = useRef<SVGGElement | null>(null);
  const top = 66 - flight.arcHeight * 70;
  useEffect(() => {
    if (!flying || !traveller.current) return;
    const element = traveller.current;
    const duration = FLIGHT_BASE_MS * flight.durationScale;
    const start = performance.now();
    let frame = 0;
    const [x0, x1] = flying.direction === 'toPartner' ? [34, 306] : [306, 34];
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const x = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * 170 + e * e * x1;
      const y = (1 - e) ** 2 * 66 + 2 * (1 - e) * e * top + e * e * 66;
      element.setAttribute(
        'transform',
        `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${flying.direction === 'toMe' ? -1 : 1} 1)`,
      );
      element.setAttribute('opacity', k >= 1 ? '0' : '1');
      if (k < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [flying, flight.durationScale, top]);
  return (
    <div className="garden-band">
      <span className="garden-band-avatar person-role-own">
        <PersonIdentity
          displayName={names.own}
          size="small"
          showName={false}
          imageAlt={names.own}
          fallbackAlt={names.own}
        />
      </span>
      <svg
        className="garden-band-arc"
        viewBox="0 0 340 96"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d={`M34 66 Q170 ${top.toFixed(1)} 306 66`}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={2}
          strokeDasharray="3 6"
          strokeLinecap="round"
        />
        {distanceLabel ? (
          <text
            x={170}
            y={90}
            textAnchor="middle"
            className="garden-band-label"
          >
            {distanceLabel}
          </text>
        ) : null}
        <g ref={traveller} opacity={0} data-testid="garden-messenger">
          <Messenger kind={flight.messenger} colour={colour} />
        </g>
      </svg>
      <span className="garden-band-avatar person-role-partner">
        <PersonIdentity
          displayName={names.partner}
          size="small"
          showName={false}
          imageAlt={names.partner}
          fallbackAlt={names.partner}
        />
      </span>
    </div>
  );
}

export function GardenGamePage({
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
  services,
  loadPartners,
  flightOverride,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  services?: GardenServices;
  loadPartners?: () => Promise<
    ReadonlyArray<{ id: string; displayName: string }>
  >;
  /** Tests pass a fixed band instead of reading partner location. */
  flightOverride?: GardenFlight;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const defaults = useDefaultServices({
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId: currentAccountId,
  });
  const api = services ?? defaults;
  const queryKey = useMemo(
    () => gardenQueryKey(currentAccountId, spaceId),
    [currentAccountId, spaceId],
  );
  const gardenQuery = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await api.load();
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    refetchOnWindowFocus: true,
  });
  const partnersQuery = useQuery({
    queryKey: ['games', 'garden', 'partners', spaceId],
    queryFn: async () => {
      if (loadPartners) return loadPartners();
      const spaces = new SpacesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      return (await spaces.getSpaceApiV1SpacesSpaceIdGet({ spaceId })).partners;
    },
    retry: false,
  });
  const partners = partnersQuery.data;
  const partner = partners?.find((entry) => entry.id !== currentAccountId);
  const names = {
    own:
      partners?.find((entry) => entry.id === currentAccountId)?.displayName ??
      t('games.garden.you'),
    partner: partner?.displayName ?? t('games.garden.partnerFallback'),
  };

  const liveFlight = useGardenFlight({
    apiBaseUrl,
    accessToken,
    accountId: currentAccountId,
    spaceId,
    enabled: !services && !flightOverride,
  });
  const flight = flightOverride ?? liveFlight;
  const shortDistance = useDistanceShortText();
  const distanceLabel = flight.band ? shortDistance(flight.band) : null;
  const messengerName = t(`games.garden.messengers.${flight.messenger}`);

  const [pick, setPick] = useState<GardenSpecies | null>(null);
  const [words, setWords] = useState<GardenWords | null>(null);
  const [wordsOpen, setWordsOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [watering, setWatering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [changes, setChanges] = useState<Map<string, number>>(new Map());
  const [gustKey, setGustKey] = useState(0);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [wateredNow, setWateredNow] = useState<string | null>(null);
  const [flying, setFlying] = useState<{
    direction: 'toPartner' | 'toMe';
    key: number;
  } | null>(null);
  const greeted = useRef<string | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const defaultSaveMoment = useGardenMomentSaver({
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId: currentAccountId,
  });
  const [binding, setBinding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [bookOpen, setBookOpen] = useState(false);
  // Visitor names (#1907 H3 follow-up): the open editor, a failed save to
  // offer again, and the reaction that asks for a name.
  const [visitorEditing, setVisitorEditing] = useState<GardenAnimal | null>(
    null,
  );
  const [visitorFailed, setVisitorFailed] = useState<{
    kind: GardenAnimal;
    draft: string;
  } | null>(null);
  const [ask, setAsk] = useState<{ kind: GardenAnimal; text: string } | null>(
    null,
  );
  const [banner, setBanner] = useState<SceneGrowth['banner']>(null);
  const [yearSaved, setYearSaved] = useState(false);
  const bouquetSvg = useRef<SVGSVGElement | null>(null);
  const reduced = prefersReducedMotion();

  const garden = gardenQuery.data;
  const presentation = useGardenPresentation(garden, prefersReducedMotion());
  // A gentle gust when the garden opens.
  const opened = garden !== undefined;
  useEffect(() => {
    if (opened) setGustKey((key) => key + 1);
  }, [opened]);
  // A waiting seed flies in once from the partner's side.
  const incomingId = garden?.incoming?.id ?? null;
  useEffect(() => {
    if (!incomingId || greeted.current === incomingId) return;
    greeted.current = incomingId;
    if (!prefersReducedMotion())
      setFlying({ direction: 'toMe', key: Date.now() });
  }, [incomingId]);

  const apply = useCallback(
    (next: GardenView, previous: GardenView | undefined) => {
      const changed = stageChanges(previous?.plants, next.plants);
      setChanges(changed);
      const revealed = next.plants.some(
        (entry) =>
          entry.species === 'MOONFLOWER' &&
          previous?.plants.find((before) => before.id === entry.id)?.species ===
            'SURPRISE',
      );
      if (revealed) setStatus(t('games.garden.growth.moonRevealed'));
      if (next.sharedToday && previous && !previous.sharedToday) {
        setCelebrationKey((key) => key + 1);
        setGustKey((key) => key + 1);
      } else if (changed.size > 0) {
        setGustKey((key) => key + 1);
      }
      queryClient.setQueryData(queryKey, next);
    },
    [queryClient, queryKey, t],
  );

  const run = useCallback(
    async (action: () => Promise<GardenView>) => {
      setBusy(true);
      setProblem(null);
      try {
        return await action();
      } catch (error) {
        const normalized = await normalizeClientError(error);
        if ((normalized as { status?: number }).status === 409) {
          setStatus(t('games.garden.changedMeanwhile'));
          await queryClient.invalidateQueries({ queryKey });
        } else {
          setProblem(normalized);
        }
        return null;
      } finally {
        setBusy(false);
      }
    },
    [queryClient, queryKey, t],
  );

  const send = async () => {
    if (!pick || !garden) return;
    const previous = garden;
    const next = await run(() =>
      api.send(pick, flight.wordsOffered ? words : null),
    );
    if (!next) return;
    const done = () => {
      apply(next, previous);
      setPick(null);
      setWords(null);
      setWordsOpen(false);
      setStatus(
        t('games.garden.sentStatus', {
          messenger: messengerName,
          name: names.partner,
        }),
      );
    };
    if (prefersReducedMotion()) {
      done();
      return;
    }
    setFlying({ direction: 'toPartner', key: Date.now() });
    window.setTimeout(done, FLIGHT_BASE_MS * flight.durationScale);
  };

  const plant = async () => {
    if (!garden?.incoming) return;
    const previous = garden;
    const next = await run(() => api.plant(previous.incoming?.id ?? ''));
    if (!next) return;
    apply(next, previous);
    setCardOpen(false);
    setStatus(t('games.garden.plantedStatus'));
  };

  const choosePlant = async (plantId: string) => {
    if (binding) {
      const entry = garden?.plants.find((plant) => plant.id === plantId);
      if (
        !entry ||
        entry.inPond ||
        !isBlooming(entry.species, entry.stage, garden?.localDate ?? new Date())
      )
        return;
      setPicked((current) =>
        current.includes(plantId)
          ? current.filter((id) => id !== plantId)
          : current.length < 3
            ? [...current, plantId]
            : current,
      );
      return;
    }
    if (!watering) {
      setSelected((current) => (current === plantId ? null : plantId));
      return;
    }
    const previous = garden;
    const next = await run(() => api.water(plantId));
    setWatering(false);
    if (!next) return;
    apply(next, previous);
    setWateredNow(plantId);
    setStatus(t('games.garden.wateredStatus', { name: names.partner }));
  };

  if (gardenQuery.isPending) {
    return (
      <div className="page garden-game-page">
        <PageHeader title={t('games.garden.title')} />
        <UiState kind="loading" title={t('games.garden.loading')} />
      </div>
    );
  }
  if (gardenQuery.error || !garden) {
    return (
      <div className="page garden-game-page">
        <PageHeader title={t('games.garden.title')} />
        <ProblemState
          error={gardenQuery.error}
          onRetry={() => void gardenQuery.refetch()}
        />
      </div>
    );
  }

  const highest = garden.plants.reduce(
    (max, entry) => (entry.inPond ? max : Math.max(max, entry.slot ?? 0)),
    0,
  );
  const unlocks = garden.unlocks ?? [];
  const sharedDays = garden.sharedDays ?? 0;
  const width = gardenWidth(highest, unlockedWidth(unlocks));
  const title = garden.name ?? t('games.garden.title');
  const news = garden.news ?? [];
  const form = garden.form ?? 'BED';
  const blooming = garden.plants.filter(
    (entry) =>
      !entry.inPond && isBlooming(entry.species, entry.stage, garden.localDate),
  );
  const roleOf = (entry: GardenPlantView) =>
    entry.senderId === currentAccountId ? 'own' : 'partner';
  const speciesName = (species: GardenSpecies) =>
    t(`games.garden.species.${species}.name`);
  const scenePlants: ScenePlant[] = garden.plants.map((entry) => {
    // A resting tulip stays a bud (growth); the reunion and the sleep phase then decide what shows.
    const shown = presentation.stageOf(
      shownStage(entry.species, entry.stage, garden.localDate),
    );
    return {
      id: entry.id,
      species: entry.species,
      slot: entry.slot ?? 0,
      inPond: entry.inPond === true,
      picked: binding && picked.includes(entry.id),
      role: roleOf(entry),
      stage: shown.stage,
      grewFrom: changes.get(entry.id) ?? shown.grewFrom,
      watered:
        garden.wateredToday === entry.id ||
        garden.partnerWateredToday === entry.id,
      label: watering
        ? t('games.garden.waterPlantLabel', {
            species: speciesName(entry.species),
          })
        : binding
          ? t('games.garden.growth.bindPlantLabel', {
              species: speciesName(entry.species),
            })
          : t('games.garden.plantLabel', {
              species: speciesName(entry.species),
              name: roleOf(entry) === 'own' ? names.own : names.partner,
            }),
    };
  });
  const selectedPlant = garden.plants.find((entry) => entry.id === selected);
  const dayFormat = new Intl.DateTimeFormat(resolvedLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const partnerWatered = garden.plants.find(
    (entry) => entry.id === garden.partnerWateredToday,
  );
  const ownColour = 'var(--person-own-accent)';
  const partnerColour = 'var(--person-partner-accent)';
  const incoming = garden.incoming ?? null;
  const reunionToday = presentation.reunion === 'today';
  const reunionDate = garden.reunionOn
    ? dayFormat.format(garden.reunionOn)
    : null;
  const sceneSentences = gardenSceneSentences(t, presentation, {
    partnerName: names.partner,
    reunionDate,
  });

  const colourOf = (senderId: string) =>
    senderId === currentAccountId ? ownColour : partnerColour;
  const pickedFlowers: BouquetFlower[] = picked
    .map((id) => garden.plants.find((entry) => entry.id === id))
    .filter((entry): entry is GardenPlantView => entry !== undefined)
    .map((entry) => ({
      species: entry.species,
      colour: colourOf(entry.senderId),
    }));
  const bouquet = garden.bouquet ?? null;
  const bouquetFlowers: BouquetFlower[] = (bouquet?.flowers ?? []).map(
    (flower) => ({
      species: flower.species,
      colour: colourOf(flower.senderId),
    }),
  );
  const named = visitorNames(garden.visitorNames);
  const metVisitors = availableAnimals(sharedDays, unlocks);
  const animalName = (kind: GardenAnimal) =>
    t(`games.garden.growth.animals.${kind}`);
  const ownVisitor = (kind: GardenAnimal) =>
    t(`games.garden.growth.visitors.own.${kind}`);
  const growth: SceneGrowth = {
    unlocks,
    sharedDays,
    fresh: new Set(news),
    // Visitors stay away while the garden sleeps (PR 2 sleep phase).
    visitors: presentation.sleep !== 'asleep',
    reduced,
    labels: {
      animal: (kind) =>
        named[kind]
          ? t('games.garden.growth.animalLabelNamed', {
              name: named[kind],
              animal: animalName(kind),
            })
          : t('games.garden.growth.animalLabel', { animal: animalName(kind) }),
      quack: t('games.garden.growth.quack'),
      name: (kind) => named[kind] ?? null,
    },
    onReaction: (kind) => {
      const name = named[kind];
      const text = name
        ? t(`games.garden.growth.reactionsNamed.${kind}`, { name })
        : t(`games.garden.growth.reactions.${kind}`);
      setStatus(text);
      // An unnamed visitor asks for a name, right next to its reaction.
      setAsk(name ? null : { kind, text });
    },
    banner,
  };
  const planeWords =
    incoming?.words != null && !reduced && wordsArriveByPlane(incoming.id);
  const now = new Date();
  const showYear = now.getMonth() === 11 && blooming.length >= 3;

  const acknowledge = async () => {
    if (!api.acknowledgeNews) return;
    const next = await run(
      () => api.acknowledgeNews?.() as Promise<GardenView>,
    );
    if (next) apply(next, garden);
  };
  const rename = async (name: string) => {
    if (!api.rename) return false;
    const next = await run(
      () => api.rename?.(name || null) as Promise<GardenView>,
    );
    if (!next) return false;
    apply(next, garden);
    setStatus(
      t('games.garden.growth.renamedStatus', {
        name: next.name ?? t('games.garden.title'),
      }),
    );
    return true;
  };
  const nameVisitor = async (kind: GardenAnimal, name: string) => {
    if (!api.nameVisitor) return;
    const previous = garden;
    const cleaned = cleanVisitorName(name);
    // Optimistic: the row shows the new name at once and rolls back on error.
    setVisitorFailed(null);
    setVisitorEditing(null);
    queryClient.setQueryData<GardenView>(queryKey, (current) =>
      current
        ? {
            ...current,
            visitorNames: withVisitorName(current.visitorNames, kind, cleaned),
          }
        : current,
    );
    const next = await run(
      () =>
        api.nameVisitor?.(
          VISITOR_CODE[kind],
          cleaned || null,
        ) as Promise<GardenView>,
    );
    if (!next) {
      queryClient.setQueryData<GardenView>(queryKey, (current) =>
        current
          ? { ...current, visitorNames: previous.visitorNames ?? [] }
          : current,
      );
      setVisitorFailed({ kind, draft: name });
      setVisitorEditing(kind);
      return;
    }
    apply(next, previous);
    const saved = visitorNames(next.visitorNames)[kind];
    setStatus(
      saved
        ? t('games.garden.growth.visitors.namedStatus', {
            visitor: ownVisitor(kind),
            name: saved,
          })
        : t('games.garden.growth.visitors.clearedStatus', {
            visitor: ownVisitor(kind),
          }),
    );
  };
  const askForName = (kind: GardenAnimal) => {
    setSelected(null);
    setVisitorFailed(null);
    setBookOpen(true);
    setVisitorEditing(kind);
  };
  const giveBouquet = async () => {
    if (!api.giveBouquet || picked.length === 0) return;
    const previous = garden;
    const next = await run(
      () => api.giveBouquet?.(picked) as Promise<GardenView>,
    );
    if (!next) return;
    const done = () => {
      apply(next, previous);
      setBinding(false);
      setPicked([]);
      setStatus(
        t('games.garden.growth.bouquetSentStatus', { name: names.partner }),
      );
    };
    if (reduced) {
      done();
      return;
    }
    setFlying({ direction: 'toPartner', key: Date.now() });
    window.setTimeout(done, FLIGHT_BASE_MS * flight.durationScale);
  };
  const closeBouquet = async (kept: boolean) => {
    if (!bouquet || !api.closeBouquet) return;
    const next = await run(
      () => api.closeBouquet?.(bouquet.id, kept) as Promise<GardenView>,
    );
    if (next) apply(next, garden);
    return next;
  };
  const keepBouquet = async () => {
    const svg = bouquetSvg.current;
    if (!bouquet || !svg || !api.saveToMoments) return;
    const saved = await run(async () => {
      const image = await renderSvgPng(svg, 640, 704, '#fffdf8');
      await api.saveToMoments?.({
        title: t('games.garden.growth.bouquetMemoryTitle', {
          name: names.partner,
        }),
        body: t('games.garden.growth.bouquetMemoryBody'),
        image,
        fileName: 'strauss.png',
      });
      return garden;
    });
    if (!saved) return;
    await closeBouquet(true);
    setStatus(t('games.garden.growth.bouquetKept'));
  };
  const keepYear = async () => {
    const svg = document.querySelector<SVGSVGElement>(
      '[data-testid="garden-scene"]',
    );
    if (!svg || !api.saveToMoments) return;
    const year = now.getFullYear();
    const saved = await run(async () => {
      const image = await renderSvgPng(
        svg,
        Math.round(width * 3),
        Math.round(210 * 3),
        '#eaf0ff',
      );
      await api.saveToMoments?.({
        title: t('games.garden.growth.yearMemoryTitle', { year }),
        body: title,
        image,
        fileName: 'garten.png',
      });
      return garden;
    });
    if (!saved) return;
    setYearSaved(true);
    setStatus(t('games.garden.growth.yearSaved'));
  };

  let card: ReactElement | null;
  if (binding) {
    card = (
      <BouquetBindCard
        flowers={pickedFlowers}
        partnerName={names.partner}
        busy={busy}
        onCancel={() => {
          setBinding(false);
          setPicked([]);
        }}
        onGive={() => void giveBouquet()}
      />
    );
  } else if (watering) {
    card = (
      <section className="garden-card" aria-labelledby="garden-card-title">
        <h2 id="garden-card-title">{t('games.garden.waterTitle')}</h2>
        <p>{t('games.garden.waterBody', { name: names.partner })}</p>
        <button
          type="button"
          className="secondary"
          onClick={() => setWatering(false)}
        >
          {t('games.garden.cancel')}
        </button>
      </section>
    );
  } else if (incoming) {
    card = (
      <section
        className="garden-card"
        aria-labelledby="garden-card-title"
        aria-live="polite"
      >
        <h2 id="garden-card-title">
          {t('games.garden.arrivedTitle', { name: names.partner })}
        </h2>
        <div className="garden-arrival">
          <SeedIcon species={incoming.species} colour={partnerColour} />
          <p>
            {t(`games.garden.species.${incoming.species}.arrived`, {
              messenger: messengerName,
            })}
          </p>
        </div>
        {incoming.words && planeWords && !cardOpen ? (
          <button
            type="button"
            className="garden-folded-card garden-plane-note"
            aria-expanded="false"
            disabled={banner !== null}
            onClick={() => {
              const words = incoming.words
                ? t(`games.garden.words.${incoming.words}`)
                : '';
              window.scrollTo?.({ top: 0, behavior: 'smooth' });
              setBanner({
                key: Date.now(),
                text: words,
                onDone: () => {
                  setBanner(null);
                  setCardOpen(true);
                },
              });
            }}
          >
            <span>{t('games.garden.growth.planeNote')}</span>
            <span className="garden-folded-action">
              {t('games.garden.growth.planeOpen')}
            </span>
          </button>
        ) : incoming.words ? (
          cardOpen ? (
            <p className="garden-words-quote person-role-partner">
              {t('games.garden.quoted', {
                words: t(`games.garden.words.${incoming.words}`),
              })}
            </p>
          ) : (
            <button
              type="button"
              className="garden-folded-card"
              aria-expanded="false"
              onClick={() => setCardOpen(true)}
            >
              <span>{t('games.garden.foldedCard')}</span>
              <span className="garden-folded-action">
                {t('games.garden.unfold')}
              </span>
            </button>
          )
        ) : null}
        <button type="button" disabled={busy} onClick={() => void plant()}>
          {t('games.garden.plant')}
        </button>
      </section>
    );
  } else if (reunionToday) {
    card = null;
  } else if (!garden.sentToday) {
    card = (
      <section className="garden-card" aria-labelledby="garden-card-title">
        <h2 id="garden-card-title">
          {t('games.garden.todayTitle', { name: names.partner })}
        </h2>
        <p>
          {t('games.garden.todayBody', {
            messenger: messengerName,
            name: names.partner,
          })}
        </p>
        <fieldset className="garden-choices">
          <legend className="visually-hidden">
            {t('games.garden.chooseSeed')}
          </legend>
          {garden.offer.map((species) => (
            <button
              key={species}
              type="button"
              className="garden-choice"
              aria-pressed={pick === species}
              onClick={() => setPick(species)}
            >
              <SeedIcon species={species} colour={ownColour} />
              <span>{speciesName(species)}</span>
            </button>
          ))}
        </fieldset>
        {pick && flight.wordsOffered ? (
          <div className="garden-words">
            <button
              type="button"
              className="garden-words-toggle"
              aria-expanded={wordsOpen}
              aria-controls="garden-words-options"
              onClick={() => setWordsOpen((open) => !open)}
            >
              <span>
                {words
                  ? t('games.garden.yourWords', {
                      words: t(`games.garden.words.${words}`),
                    })
                  : t('games.garden.wordsQuestion')}
              </span>
              {words ? (
                <span className="garden-words-change">
                  {t('games.garden.change')}
                </span>
              ) : null}
            </button>
            {wordsOpen ? (
              <fieldset
                id="garden-words-options"
                className="garden-words-options"
              >
                <legend className="visually-hidden">
                  {t('games.garden.wordsQuestion')}
                </legend>
                {GARDEN_WORDS.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className="garden-word"
                    aria-pressed={words === code}
                    onClick={() => {
                      setWords((current) => (current === code ? null : code));
                      setWordsOpen(false);
                    }}
                  >
                    {t(`games.garden.words.${code}`)}
                  </button>
                ))}
              </fieldset>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          disabled={!pick || busy}
          onClick={() => void send()}
        >
          {t('games.garden.send')}
        </button>
      </section>
    );
  } else if (!garden.partnerSentToday) {
    card = (
      <section className="garden-card" aria-labelledby="garden-card-title">
        <h2 id="garden-card-title">
          {t('games.garden.waitingTitle', { name: names.partner })}
        </h2>
        <p>{t('games.garden.waitingBody', { name: names.partner })}</p>
      </section>
    );
  } else {
    card = (
      <section className="garden-card" aria-labelledby="garden-card-title">
        <h2 id="garden-card-title">{t('games.garden.sharedTitle')}</h2>
        <p>{t('games.garden.sharedBody')}</p>
      </section>
    );
  }

  return (
    <div className="page garden-game-page">
      <PageHeader title={title} />
      <FlightBand
        names={names}
        flight={flight}
        flying={flying}
        distanceLabel={distanceLabel}
        colour={ownColour}
      />
      <div
        ref={frame}
        className={`garden-frame${width > 340 ? ' is-wide' : ''}`}
        data-testid="garden-frame"
        data-season={presentation.season}
        data-sleep={presentation.sleep}
      >
        <GardenScene
          plants={scenePlants}
          width={width}
          selectedId={selected}
          watering={watering}
          onSelect={(plantId) => void choosePlant(plantId)}
          gustKey={gustKey}
          celebrationKey={celebrationKey}
          wateredPlantId={wateredNow}
          lively
          label={[
            `${title}, ${t(`games.garden.growth.forms.${form}`)}: ${t('games.garden.sceneLabel', { count: garden.plants.length })}`,
            ...sceneSentences,
          ].join('. ')}
          layers={presentation.layers(width)}
          growth={growth}
        />
      </div>
      {width > 340 ? (
        <p className="garden-pan-hint">{t('games.garden.panHint')}</p>
      ) : null}
      <GardenSleepCard presentation={presentation} />
      {selectedPlant ? (
        <section className="garden-card garden-story" aria-live="polite">
          <div className="garden-story-head">
            <SeedIcon
              species={selectedPlant.species}
              colour={
                roleOf(selectedPlant) === 'own' ? ownColour : partnerColour
              }
              size={40}
            />
            <h2>{speciesName(selectedPlant.species)}</h2>
            <button
              type="button"
              className="secondary garden-story-close"
              onClick={() => setSelected(null)}
            >
              {t('games.garden.close')}
            </button>
          </div>
          <p>
            {t('games.garden.storySent', {
              name:
                roleOf(selectedPlant) === 'own'
                  ? t('games.garden.youDative')
                  : names.partner,
              date: dayFormat.format(selectedPlant.sentOn),
            })}
          </p>
          <p>
            {selectedPlant.species === 'TULIP' &&
            selectedPlant.stage >= 1 &&
            shownStage('TULIP', selectedPlant.stage, garden.localDate) <
              Math.max(selectedPlant.stage, 2)
              ? t('games.garden.growth.restingTulip')
              : t(
                  `games.garden.stages.${selectedPlant.stage}` as 'games.garden.stages.0',
                )}
            {selectedPlant.species === 'MOONFLOWER' && selectedPlant.stage === 3
              ? ` ${t('games.garden.growth.moonGlow')}`
              : null}
          </p>
          {selectedPlant.words ? (
            <p
              className={`garden-words-quote person-role-${roleOf(selectedPlant)}`}
            >
              {t('games.garden.quoted', {
                words: t(`games.garden.words.${selectedPlant.words}`),
              })}
            </p>
          ) : null}
        </section>
      ) : null}
      {problem ? (
        <ProblemState error={problem} onRetry={() => setProblem(null)} />
      ) : null}
      {presentation.reunion === 'soon' && reunionDate ? (
        <GardenReunionSoonCard date={reunionDate} />
      ) : null}
      {reunionToday ? (
        <GardenReunionTodayCard
          canSave={garden.plants.length > 0}
          localDate={garden.localDate}
          scene={() =>
            frame.current?.querySelector<SVGSVGElement>('svg.garden-scene') ??
            null
          }
          save={api.saveMoment ?? defaultSaveMoment}
        />
      ) : null}
      {news.length > 0 ? (
        <GardenNewsCard
          news={news}
          form={form}
          busy={busy}
          onDone={() => void acknowledge()}
        />
      ) : null}
      {bouquet ? (
        <BouquetReceivedCard
          flowers={bouquetFlowers}
          partnerName={names.partner}
          messengerName={messengerName}
          busy={busy}
          svgRef={bouquetSvg}
          onThanks={() => void closeBouquet(false)}
          onKeep={() => void keepBouquet()}
        />
      ) : null}
      {card}
      {!watering && !binding ? (
        <div className="garden-tools">
          {!reunionToday &&
          garden.wateredToday == null &&
          garden.plants.length > 0 ? (
            <button
              type="button"
              className="secondary garden-water"
              onClick={() => {
                setSelected(null);
                setWatering(true);
              }}
            >
              {t('games.garden.water')}
            </button>
          ) : null}
          {blooming.length >= 2 && !garden.gaveBouquetToday ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setSelected(null);
                setBookOpen(false);
                setPicked([]);
                setBinding(true);
              }}
            >
              {t('games.garden.growth.bind')}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary"
            aria-expanded={bookOpen}
            aria-controls="garden-book"
            onClick={() => setBookOpen((open) => !open)}
          >
            {t('games.garden.growth.book')}
          </button>
        </div>
      ) : null}
      {bookOpen ? (
        <div id="garden-book">
          <GardenBook
            name={garden.name ?? null}
            form={form}
            discovered={garden.discovered ?? []}
            unlocks={unlocks}
            colour={ownColour}
            busy={busy}
            onRename={rename}
            visitors={
              <GardenVisitors
                met={metVisitors}
                names={named}
                editing={visitorEditing}
                busy={busy}
                failed={visitorFailed}
                onEdit={(kind) => {
                  setVisitorFailed(null);
                  setVisitorEditing(kind);
                }}
                onName={(kind, name) => void nameVisitor(kind, name)}
              />
            }
          />
        </div>
      ) : null}
      {showYear ? (
        <GardenYearCard
          year={now.getFullYear()}
          busy={busy}
          saved={yearSaved}
          onSave={() => void keepYear()}
        />
      ) : null}
      {partnerWatered ? (
        <p className="garden-note">
          {roleOf(partnerWatered) === 'own'
            ? t('games.garden.partnerWateredYours', {
                name: names.partner,
                species: speciesName(partnerWatered.species),
              })
            : t('games.garden.partnerWatered', {
                name: names.partner,
                species: speciesName(partnerWatered.species),
              })}
        </p>
      ) : null}
      <div className="garden-status-line">
        <p className="garden-status" role="status" aria-live="polite">
          {status}
        </p>
        {ask && ask.text === status && !named[ask.kind] ? (
          <button
            type="button"
            className="tertiary garden-status-ask"
            aria-controls="garden-book"
            onClick={() => askForName(ask.kind)}
          >
            {t(`games.garden.growth.askName.${ask.kind}`)}
          </button>
        ) : null}
      </div>
      <p className="garden-footnote">{t('games.garden.footnote')}</p>
    </div>
  );
}
