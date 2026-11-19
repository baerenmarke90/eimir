import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GardenView } from '../api/generated/models/GardenView';
import {
  type GardenSeason,
  gardenSceneImage,
  gardenSeason,
  lanternsLit,
  type ReunionPhase,
  reunionPhase,
  type SleepPhase,
  shownStage,
} from '../client/gardenPresentation';
import {
  createMemoryWithReadyAttachments,
  uploadMemoryDraftAttachment,
} from '../client/memoryAttachmentDraft';
import { normalizeClientError } from '../client/problemDetails';
import { createReferenceApis } from '../client/referenceFlow';
import { memoryDetailPath } from '../client/routes';
import { useTranslation } from '../i18n';
import {
  Bunting,
  FallingLeaves,
  GardenMist,
  Lantern,
  ReunionGate,
  SpringBlossoms,
  WinterSnow,
} from './GardenSeasonArt';
import { ProblemState } from './ProblemState';

/** The mist rests a moment before it lifts, then lifts within this time. */
export const WAKE_DELAY_MS = 1600;
const MIST_LIFT_MS = 1900;
const LEAVES_MS = 5200;

export type SaveGardenMoment = (input: {
  title: string;
  body: string;
  happenedOn: Date;
  image: Blob;
}) => Promise<{ memoryId: string }>;

/** Saves a still of the garden as a photo Moment through the media path. */
export function useGardenMomentSaver({
  apiBaseUrl,
  accessToken,
  spaceId,
  accountId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
}): SaveGardenMoment {
  return useMemo(() => {
    const apis = createReferenceApis(apiBaseUrl, accessToken);
    return async ({ title, body, happenedOn, image }) => {
      const file = new File([image], 'unser-garten.png', {
        type: 'image/png',
      });
      const ready = await uploadMemoryDraftAttachment(
        apis,
        apiBaseUrl,
        accessToken,
        spaceId,
        file,
        undefined,
        fetch,
        { accountId },
      );
      const { memory } = await createMemoryWithReadyAttachments(
        apis,
        spaceId,
        { title, body, happenedOn },
        [ready.attachmentId],
      );
      return { memoryId: memory.id };
    };
  }, [accessToken, accountId, apiBaseUrl, spaceId]);
}

export interface GardenPresentation {
  season: GardenSeason;
  reunion: ReunionPhase;
  sleep: SleepPhase;
  woke: boolean;
  closeWoke: () => void;
  lit: { own: boolean; partner: boolean };
  /** The stage to draw and, for one-shot motion, the stage it opens from. */
  stageOf: (stage: number) => { stage: number; grewFrom?: number };
  layers: (width: number) => {
    sky?: ReactNode;
    ground?: ReactNode;
    meadow?: ReactNode;
    overlay?: ReactNode;
  };
}

/**
 * Seasons, lanterns, the reunion and the sleeping garden, all derived from
 * the server view. Waking is a one-shot moment; reduced motion skips to the
 * awake garden and keeps the welcome.
 */
export function useGardenPresentation(
  garden: GardenView | undefined,
  reducedMotion: boolean,
): GardenPresentation {
  const [phase, setPhase] = useState<SleepPhase | null>(null);
  const [woke, setWoke] = useState(false);
  const [leaves, setLeaves] = useState(false);
  const started = useRef(false);
  const fell = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );
  const sleeping = garden?.sleeping === true;
  const sleep: SleepPhase =
    phase ?? (sleeping && !reducedMotion ? 'asleep' : 'awake');
  useEffect(() => {
    if (!sleeping || started.current) return;
    started.current = true;
    if (reducedMotion) {
      setPhase('awake');
      setWoke(true);
      return;
    }
    setPhase('asleep');
    timers.current.push(
      window.setTimeout(() => {
        setPhase('waking');
        setWoke(true);
      }, WAKE_DELAY_MS),
      window.setTimeout(() => setPhase('awake'), WAKE_DELAY_MS + MIST_LIFT_MS),
    );
  }, [sleeping, reducedMotion]);

  const season = gardenSeason(garden?.localDate ?? new Date());
  const reunion = garden ? reunionPhase(garden) : 'none';
  useEffect(() => {
    if (!garden || fell.current || reducedMotion) return;
    if (season !== 'autumn' || sleep === 'asleep' || reunion === 'today')
      return;
    fell.current = true;
    setLeaves(true);
    timers.current.push(window.setTimeout(() => setLeaves(false), LEAVES_MS));
  }, [garden, season, sleep, reunion, reducedMotion]);

  const lit = garden
    ? lanternsLit(garden, sleep)
    : { own: false, partner: false };
  const reunionToday = reunion === 'today';
  return {
    season,
    reunion,
    sleep,
    woke,
    closeWoke: () => setWoke(false),
    lit,
    stageOf: (stage) => {
      const shown = shownStage(stage, {
        reunionToday,
        asleep: sleep === 'asleep',
      });
      if (reunionToday && stage < 3) return { stage: shown, grewFrom: stage };
      if (sleep === 'waking' && stage === 3) return { stage, grewFrom: 2 };
      return { stage: shown };
    },
    layers: (width) => ({
      sky: reunionToday ? <Bunting width={width} /> : null,
      ground: season === 'winter' ? <WinterSnow width={width} /> : null,
      meadow: (
        <>
          {season === 'spring' ? <SpringBlossoms width={width} /> : null}
          {reunion === 'soon' ? <ReunionGate x={width - 24} /> : null}
          <Lantern x={12} lit={lit.own} person="own" />
          <Lantern
            x={reunion === 'soon' ? width - 48 : width - 12}
            lit={lit.partner}
            person="partner"
          />
        </>
      ),
      overlay: (
        <>
          {leaves ? <FallingLeaves width={width} /> : null}
          {sleep !== 'awake' ? (
            <GardenMist width={width} lifting={sleep === 'waking'} />
          ) : null}
        </>
      ),
    }),
  };
}

/** One sentence each for what the decoration shows, for the scene label. */
export function gardenSceneSentences(
  t: ReturnType<typeof useTranslation>['t'],
  presentation: GardenPresentation,
  {
    partnerName,
    reunionDate,
  }: { partnerName: string; reunionDate: string | null },
): string[] {
  const sentences = [t(`games.garden.seasons.${presentation.season}`)];
  const { own, partner } = presentation.lit;
  if (own && partner) sentences.push(t('games.garden.lanterns.both'));
  else if (own) sentences.push(t('games.garden.lanterns.own'));
  else if (partner)
    sentences.push(t('games.garden.lanterns.partner', { name: partnerName }));
  if (presentation.sleep === 'asleep')
    sentences.push(t('games.garden.sleep.sceneLabel'));
  if (presentation.reunion === 'today')
    sentences.push(t('games.garden.reunion.buntingLabel'));
  else if (presentation.reunion === 'soon' && reunionDate)
    sentences.push(t('games.garden.reunion.gateLabel', { date: reunionDate }));
  return sentences;
}

/** The sleeping garden and its gentle welcome; never a reproach. */
export function GardenSleepCard({
  presentation,
}: {
  presentation: GardenPresentation;
}) {
  const { t } = useTranslation();
  if (presentation.sleep === 'asleep') {
    return (
      <section
        className="garden-card is-calm garden-sleep-card"
        aria-live="polite"
        data-testid="garden-sleep-card"
      >
        <h2>{t('games.garden.sleep.title')}</h2>
        <p>{t('games.garden.sleep.body')}</p>
      </section>
    );
  }
  if (!presentation.woke) return null;
  return (
    <section
      className="garden-card is-calm garden-sleep-card"
      aria-live="polite"
      data-testid="garden-woke-card"
    >
      <h2>{t('games.garden.sleep.wokeTitle')}</h2>
      <p>{t('games.garden.sleep.wokeBody')}</p>
      <div className="garden-card-actions">
        <button
          type="button"
          className="secondary"
          onClick={presentation.closeWoke}
        >
          {t('games.garden.sleep.wokeClose')}
        </button>
      </div>
    </section>
  );
}

/** The calm card for an upcoming reunion from Plans. */
export function GardenReunionSoonCard({ date }: { date: string }) {
  const { t } = useTranslation();
  return (
    <section
      className="garden-card is-calm"
      aria-labelledby="garden-reunion-title"
      data-testid="garden-reunion-soon"
    >
      <p className="garden-eyebrow">{t('games.garden.reunion.eyebrow')}</p>
      <h2 id="garden-reunion-title">
        {t('games.garden.reunion.soonTitle', { date })}
      </h2>
      <p>{t('games.garden.reunion.soonBody')}</p>
    </section>
  );
}

/** The reunion day: everything blooms, and the garden can become a Moment. */
export function GardenReunionTodayCard({
  canSave,
  localDate,
  scene,
  save,
}: {
  canSave: boolean;
  localDate: Date;
  scene: () => SVGSVGElement | null;
  save: SaveGardenMoment;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const keep = async () => {
    const svg = scene();
    if (!svg) return;
    setSaving(true);
    setProblem(null);
    try {
      const image = await gardenSceneImage(svg);
      const { memoryId } = await save({
        title: t('games.garden.reunion.memoryTitle'),
        body: t('games.garden.reunion.memoryBody'),
        happenedOn: localDate,
        image,
      });
      setSavedId(memoryId);
    } catch (error) {
      setProblem(await normalizeClientError(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className="garden-card"
      aria-labelledby="garden-card-title"
      data-testid="garden-reunion-today"
    >
      <h2 id="garden-card-title">{t('games.garden.reunion.todayTitle')}</h2>
      <p>{t('games.garden.reunion.todayBody')}</p>
      {problem ? (
        <ProblemState error={problem} onRetry={() => void keep()} />
      ) : null}
      {savedId ? (
        <p className="garden-card-actions" role="status">
          <span>{t('games.garden.reunion.saved')}</span>
          <Link to={memoryDetailPath(savedId)}>
            {t('games.garden.reunion.openMoment')}
          </Link>
        </p>
      ) : canSave ? (
        <button type="button" disabled={saving} onClick={() => void keep()}>
          {saving
            ? t('games.garden.reunion.saving')
            : t('games.garden.reunion.save')}
        </button>
      ) : null}
    </section>
  );
}
