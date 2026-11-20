/**
 * "Euer Gartenjahr abspielen" (#1907 H3 follow-up): a short client-side
 * timelapse of the shared garden in a dialog. The plantings come back in the
 * order of their planted dates and grow to their stage of today, the seasons
 * pass from spring to winter, the garden's forms follow as the couple reached
 * them, and the replay ends on today. It reuses the real garden scene with a
 * moment of the replay instead of drawing anything twice.
 *
 * With reduced motion nothing plays: the dialog shows the start and today
 * next to each other.
 */

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GardenForm } from '../api/generated/models/GardenForm';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import {
  PLAYBACK_MS,
  type PlaybackFrame,
  playbackFrame,
  playbackStart,
  playbackTimeline,
} from '../client/gardenStory';
import { useTranslation } from '../i18n';
import { GardenScene, type ScenePlant } from './GardenScene';
import { SpringBlossoms, WinterSnow } from './GardenSeasonArt';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import './GardenPlayback.css';
import '../motion/playback.css';

export interface PlaybackPlant extends ScenePlant {
  sentOn: Date;
}

const NO_LABELS = { animal: () => '', quack: '' };

function signature(frame: PlaybackFrame): string {
  let stages = 0;
  for (const stage of frame.stages.values()) stages += stage + 1;
  return `${frame.stages.size}:${stages}:${frame.unlocks.length}:${frame.form}:${frame.season}:${frame.today}`;
}

/** One still of the garden at a moment of the replay, drawn by the real scene. */
function PlaybackScene({
  plants,
  frame,
  previous,
  width,
  days,
  animate,
  label,
}: {
  plants: ReadonlyArray<PlaybackPlant>;
  frame: PlaybackFrame;
  previous: PlaybackFrame | null;
  width: number;
  /** Shared days at this moment, for the background trees. */
  days: number;
  animate: boolean;
  label: string;
}) {
  const scenePlants: ScenePlant[] = plants.flatMap((plant) => {
    const stage = frame.stages.get(plant.id);
    if (stage === undefined) return [];
    const before = previous?.stages.get(plant.id);
    return [
      {
        ...plant,
        stage,
        grewFrom: animate
          ? before === undefined
            ? -1
            : before < stage
              ? before
              : undefined
          : undefined,
        watered: false,
        picked: false,
      },
    ];
  });
  const fresh = new Set<GardenUnlock>(
    animate
      ? frame.unlocks.filter((unlock) => !previous?.unlocks.includes(unlock))
      : [],
  );
  return (
    <div
      className="garden-frame garden-playback-stage"
      data-season={frame.season}
      inert
    >
      <GardenScene
        plants={scenePlants}
        width={width}
        selectedId={null}
        watering={false}
        onSelect={() => undefined}
        gustKey={0}
        celebrationKey={0}
        lively={false}
        label={label}
        layers={{
          ground:
            frame.season === 'winter' ? <WinterSnow width={width} /> : null,
          meadow:
            frame.season === 'spring' ? <SpringBlossoms width={width} /> : null,
        }}
        growth={{
          unlocks: frame.unlocks,
          sharedDays: days,
          fresh,
          visitors: false,
          reduced: true,
          labels: NO_LABELS,
        }}
      />
    </div>
  );
}

export function GardenPlayback({
  plants,
  unlocks,
  form,
  sharedDays,
  localDate,
  width,
  reduced,
  onClose,
}: {
  plants: ReadonlyArray<PlaybackPlant>;
  unlocks: ReadonlyArray<GardenUnlock>;
  form: GardenForm;
  sharedDays: number;
  localDate: Date;
  width: number;
  reduced: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDivElement | null>(null);
  const primary = useRef<HTMLButtonElement | null>(null);
  const timeline = useMemo(
    () => playbackTimeline({ plants, unlocks, form, localDate }),
    [plants, unlocks, form, localDate],
  );
  const start = playbackStart(timeline);
  const [time, setTime] = useState(reduced ? 1 : start);
  const [playing, setPlaying] = useState(!reduced);
  const elapsed = useRef(start * PLAYBACK_MS);
  const shown = useRef<{
    frame: PlaybackFrame;
    previous: PlaybackFrame | null;
  }>({ frame: playbackFrame(timeline, reduced ? 1 : start), previous: null });

  useModalLifecycle({ active: true, initialFocusRef: primary });

  useEffect(() => {
    if (!playing) return;
    let frameId = 0;
    let last = performance.now();
    let current = signature(shown.current.frame);
    const step = (now: number) => {
      elapsed.current = Math.min(PLAYBACK_MS, elapsed.current + (now - last));
      last = now;
      const t = elapsed.current / PLAYBACK_MS;
      const next = playbackFrame(timeline, t);
      const key = signature(next);
      if (key !== current) {
        current = key;
        shown.current = { frame: next, previous: shown.current.frame };
        setTime(t);
      }
      if (t >= 1) {
        setPlaying(false);
        return;
      }
      frameId = window.requestAnimationFrame(step);
    };
    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [playing, timeline]);

  const replay = useCallback(() => {
    elapsed.current = start * PLAYBACK_MS;
    const first = playbackFrame(timeline, start);
    shown.current = { frame: first, previous: null };
    setTime(start);
    setPlaying(true);
  }, [start, timeline]);

  // Escape closes the replay wherever focus is, like any modal layer.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close.current();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    containModalTabFocus(event, dialog.current, { wrapFromOutside: true });
  };

  const caption = (frame: PlaybackFrame) =>
    t('games.garden.story.playback.caption', {
      season: frame.today
        ? t('games.garden.story.playback.today')
        : t(`games.garden.story.playback.seasons.${frame.season}`),
      form: t(`games.garden.growth.forms.${frame.form}`),
    });

  const finished = !reduced && time >= 1;
  const { frame, previous } = shown.current;
  const startFrame = playbackFrame(timeline, start);
  const todayFrame = playbackFrame(timeline, 1);

  return (
    <div className="garden-playback-backdrop">
      <div
        ref={dialog}
        className="garden-playback"
        role="dialog"
        aria-modal="true"
        aria-labelledby="garden-playback-title"
        aria-describedby="garden-playback-body"
        data-testid="garden-playback"
        onKeyDown={onKeyDown}
      >
        <p className="garden-eyebrow">{t('games.garden.growth.book')}</p>
        <h2 id="garden-playback-title">
          {t('games.garden.story.playback.title')}
        </h2>
        <p id="garden-playback-body" className="garden-hint">
          {reduced
            ? t('games.garden.story.playback.stillBody')
            : t('games.garden.story.playback.body')}
        </p>
        {reduced ? (
          <div
            className="garden-playback-pair"
            data-testid="garden-playback-pair"
          >
            <figure>
              <PlaybackScene
                plants={plants}
                frame={startFrame}
                previous={null}
                width={width}
                days={0}
                animate={false}
                label={t('games.garden.story.playback.start')}
              />
              <figcaption>{t('games.garden.story.playback.start')}</figcaption>
            </figure>
            <figure>
              <PlaybackScene
                plants={plants}
                frame={todayFrame}
                previous={null}
                width={width}
                days={sharedDays}
                animate={false}
                label={t('games.garden.story.playback.today')}
              />
              <figcaption>{t('games.garden.story.playback.today')}</figcaption>
            </figure>
          </div>
        ) : (
          <>
            <PlaybackScene
              plants={plants}
              frame={frame}
              previous={previous}
              width={width}
              days={Math.round(sharedDays * Math.min(1, time))}
              animate
              label={caption(frame)}
            />
            <p
              className="garden-playback-caption"
              aria-live="polite"
              data-testid="garden-playback-caption"
            >
              {caption(frame)}
            </p>
          </>
        )}
        <div className="garden-card-actions">
          {reduced ? null : (
            <button
              ref={primary}
              type="button"
              className="secondary"
              data-testid="garden-playback-toggle"
              onClick={() => {
                if (finished) replay();
                else setPlaying((value) => !value);
              }}
            >
              {finished
                ? t('games.garden.story.playback.again')
                : playing
                  ? t('games.garden.story.playback.pause')
                  : t('games.garden.story.playback.resume')}
            </button>
          )}
          <button
            ref={reduced ? primary : undefined}
            type="button"
            className="secondary"
            onClick={onClose}
          >
            {t('games.garden.story.playback.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The play action in the garden book; it opens the replay dialog. */
export function GardenPlaybackAction({ onPlay }: { onPlay: () => void }) {
  const { t } = useTranslation();
  return (
    <section
      className="garden-playback-action"
      aria-labelledby="garden-playback-action-title"
    >
      <h3 id="garden-playback-action-title">
        {t('games.garden.story.playback.title')}
      </h3>
      <p className="garden-hint">{t('games.garden.story.playback.intro')}</p>
      <button
        type="button"
        className="secondary"
        aria-haspopup="dialog"
        onClick={onPlay}
      >
        {t('games.garden.story.playback.play')}
      </button>
    </section>
  );
}
