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
import { usePartnerDistanceLine } from '../client/partnerDistance';
import {
  createPartnerLocationApi,
  PARTNER_LOCATION_CAPABILITY,
  partnerLocationSettingsQueryKey,
} from '../client/partnerLocation';
import { normalizeClientError } from '../client/problemDetails';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { resolvedLocale, useTranslation } from '../i18n';
import { Messenger, SeedIcon } from './GardenArt';
import {
  GardenReunionSoonCard,
  GardenReunionTodayCard,
  GardenSleepCard,
  gardenSceneSentences,
  type SaveGardenMoment,
  useGardenMomentSaver,
  useGardenPresentation,
} from './GardenPresentation';
import { GardenScene, type ScenePlant } from './GardenScene';
import { PageHeader } from './PageHeader';
import { useDistanceShortText } from './PartnerDistanceLine';
import { PersonIdentity } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './GardenGamePage.css';

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
}

function useDefaultServices({
  apiBaseUrl,
  accessToken,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
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
    };
  }, [accessToken, apiBaseUrl, spaceId]);
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
  const defaults = useDefaultServices({ apiBaseUrl, accessToken, spaceId });
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
      if (next.sharedToday && previous && !previous.sharedToday) {
        setCelebrationKey((key) => key + 1);
        setGustKey((key) => key + 1);
      } else if (changed.size > 0) {
        setGustKey((key) => key + 1);
      }
      queryClient.setQueryData(queryKey, next);
    },
    [queryClient, queryKey],
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
    (max, entry) => Math.max(max, entry.slot ?? 0),
    0,
  );
  const width = gardenWidth(highest);
  const roleOf = (entry: GardenPlantView) =>
    entry.senderId === currentAccountId ? 'own' : 'partner';
  const speciesName = (species: GardenSpecies) =>
    t(`games.garden.species.${species}.name`);
  const scenePlants: ScenePlant[] = garden.plants.map((entry) => ({
    id: entry.id,
    species: entry.species,
    slot: entry.slot ?? 0,
    role: roleOf(entry),
    stage: presentation.stageOf(entry.stage).stage,
    grewFrom:
      changes.get(entry.id) ?? presentation.stageOf(entry.stage).grewFrom,
    watered:
      garden.wateredToday === entry.id ||
      garden.partnerWateredToday === entry.id,
    label: watering
      ? t('games.garden.waterPlantLabel', {
          species: speciesName(entry.species),
        })
      : t('games.garden.plantLabel', {
          species: speciesName(entry.species),
          name: roleOf(entry) === 'own' ? names.own : names.partner,
        }),
  }));
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

  let card: ReactElement | null;
  if (watering) {
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
        {incoming.words ? (
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
      <PageHeader title={t('games.garden.title')} />
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
            t('games.garden.sceneLabel', { count: garden.plants.length }),
            ...sceneSentences,
          ].join('. ')}
          layers={presentation.layers(width)}
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
            {t(
              `games.garden.stages.${selectedPlant.stage}` as 'games.garden.stages.0',
            )}
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
      {card}
      {!watering &&
      !reunionToday &&
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
      <p className="garden-status" role="status" aria-live="polite">
        {status}
      </p>
      <p className="garden-footnote">{t('games.garden.footnote')}</p>
    </div>
  );
}
