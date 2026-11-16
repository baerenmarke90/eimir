import { useEffect, useRef, useState } from 'react';
import { audioPeaks, voiceTime } from '../client/voiceNotes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './VoiceNotes.css';

export function VoiceNotePreview({ duration }: { duration?: number | null }) {
  const { t } = useTranslation();
  return (
    <span className="voice-note-preview" aria-hidden="true">
      <EimirIcon name="microphone" />
      <span>{t('voiceNotes.title')}</span>
      {duration != null ? (
        <span className="voice-time">{voiceTime(duration)}</span>
      ) : null}
    </span>
  );
}

export function VoiceWaveform({ peaks }: { peaks: readonly number[] }) {
  return (
    <svg
      className="voice-waveform"
      viewBox="0 0 192 48"
      aria-hidden="true"
      focusable="false"
    >
      {peaks.length ? (
        <path
          strokeWidth="2"
          strokeLinecap="round"
          d={peaks
            .map((peak, index) => {
              const height = Math.max(
                2,
                Math.min(44, (peak / Math.max(0.01, ...peaks)) * 44),
              );
              return `M${index * 4} ${(48 - height) / 2}v${height}`;
            })
            .join(' ')}
        />
      ) : (
        <path d="M0 24H192" />
      )}
    </svg>
  );
}
export function VoiceNotePlayer({
  src,
  title,
  defaultTitle = false,
  speaker,
  duration: knownDuration,
}: {
  src: string;
  title?: string;
  defaultTitle?: boolean;
  speaker?: string;
  duration?: number | null;
}) {
  const { t } = useTranslation();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = audio.current;
    setPlaying(false);
    setPosition(0);
    setDuration(knownDuration ?? 0);
    setFailed(false);
    setPeaks([]);
    const request = new AbortController();
    let context: AudioContext | undefined;
    // URL comes from our owned local preview or authorized bounded media loader.
    if (typeof AudioContext !== 'undefined') {
      void fetch(src, { signal: request.signal })
        .then((response) => response.arrayBuffer())
        .then(async (bytes) => {
          if (request.signal.aborted) return;
          context = new AudioContext();
          const decoded = await context.decodeAudioData(bytes);
          if (!request.signal.aborted) {
            setPeaks(audioPeaks(decoded));
            setDuration(decoded.duration);
          }
        })
        .catch(() => {
          /* Playback still works when optional waveform decoding is unavailable. */
        })
        .finally(() => {
          void context?.close().catch(() => {});
        });
    }
    return () => {
      request.abort();
      element?.pause();
      if (element?.getAttribute('src') === src) {
        element.removeAttribute('src');
        element.load();
      }
    };
  }, [src, knownDuration]);
  async function toggle() {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    try {
      setFailed(false);
      await element.play();
    } catch {
      setFailed(true);
    }
  }
  return (
    <section
      className="voice-player"
      aria-label={title || t('voiceNotes.title')}
    >
      {title ? (
        <h3
          className="voice-player-title"
          data-default-title={defaultTitle || undefined}
        >
          {title}
        </h3>
      ) : null}
      {speaker ? (
        <p className="voice-speaker">
          {t('voiceNotes.speakerLabel', { name: speaker })}
        </p>
      ) : null}
      {/* Textual labels and controls remain usable without a transcript or waveform. */}
      {/* biome-ignore lint/a11y/useMediaCaption: Authored voice is supported without transcription; optional text context and all playback controls are accessible. */}
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          const value = audio.current?.duration;
          if (value && Number.isFinite(value)) setDuration(value);
        }}
        onError={() => setFailed(true)}
      />
      <div className="voice-player-controls">
        <button
          type="button"
          className="voice-play"
          onClick={() => void toggle()}
          aria-label={t(playing ? 'voiceNotes.pause' : 'voiceNotes.play')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {playing ? (
              <path d="M7 5h4v14H7zM14 5h4v14h-4z" />
            ) : (
              <path d="m8 4 13 8-13 8z" />
            )}
          </svg>
        </button>
        <div className="voice-seek">
          <VoiceWaveform peaks={peaks} />
          <input
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={Math.min(position, duration || 1)}
            aria-label={t('voiceNotes.seek')}
            aria-valuetext={`${voiceTime(position)} / ${voiceTime(Math.ceil(duration))}`}
            disabled={!duration}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (audio.current) audio.current.currentTime = value;
              setPosition(value);
            }}
          />
        </div>
        <span className="voice-time">
          {voiceTime(position)} / {voiceTime(Math.ceil(duration))}
        </span>
      </div>
      {failed ? <p role="alert">{t('voiceNotes.playFailed')}</p> : null}
    </section>
  );
}
