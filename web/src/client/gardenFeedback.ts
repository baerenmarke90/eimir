/**
 * Optional feedback in the shared garden (#1907 H3 follow-up): soft sounds
 * and, in the native app only, a light vibration on taps and reactions.
 *
 * Both are off by default. The two on/off choices are personal settings: they
 * are remembered here first and then follow the Account to the person's other
 * devices through the personal settings sync (no sound, tap or garden content
 * ever leaves the device). Sounds are made with the Web Audio API (no audio
 * files, so nothing to license or download) and start only from a tap, so a
 * browser never plays them unasked. Vibration uses the Web Vibration API
 * inside the Capacitor WebView, which the Android app allows with the normal
 * `VIBRATE` permission (no prompt); the decision follows the runtime
 * platform, never the viewport width.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isCapacitorNative } from '../pwa';
import { announcePersonalSettingChange } from './personalSettingsBus';

const PREFIX = 'eimir-garden-feedback-v1';
const CHANGE_EVENT = 'eimir:garden-feedback-change';

export type GardenFeedbackSetting = 'sound' | 'vibration';

export function gardenFeedbackKey(
  accountId: string,
  setting: GardenFeedbackSetting,
): string {
  return JSON.stringify([PREFIX, accountId, setting]);
}

/** Anything but an explicit `true` means off. */
export function readGardenFeedback(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

/** A person's own choice on this device; it follows the Account to other devices. */
export function saveGardenFeedback(key: string, enabled: boolean): void {
  writeGardenFeedback(key, enabled);
  announcePersonalSettingChange(key);
}

/** Applies the Account's saved choice from another device without echoing it back. */
export function applySyncedGardenFeedback(key: string, enabled: boolean): void {
  writeGardenFeedback(key, enabled);
  // An open garden picks the new choice up at once.
  window.dispatchEvent(
    new CustomEvent<SyncedGardenFeedback>(CHANGE_EVENT, {
      detail: { key, enabled },
    }),
  );
}

type SyncedGardenFeedback = { key: string; enabled: boolean };

function writeGardenFeedback(key: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(key, String(enabled));
  } catch {
    /* The current view still honors the choice without persistent storage. */
  }
}

/* Sounds ------------------------------------------------------------------------ */

export type GardenSound =
  | 'plop'
  | 'water'
  | 'chirp'
  | 'quack'
  | 'hoot'
  | 'chime';

/** Low on purpose: a garden murmurs, it does not ring. */
export const GARDEN_VOLUME = 0.06;

type Tone = {
  /** Start offset in seconds. */
  at: number;
  duration: number;
  from: number;
  to: number;
  type: OscillatorType;
  gain?: number;
};

/** Each sound as a few short, softly enveloped tones. */
export const SOUND_TONES: Record<GardenSound, ReadonlyArray<Tone>> = {
  // A seed drops into soft soil.
  plop: [{ at: 0, duration: 0.16, from: 420, to: 140, type: 'sine' }],
  // A few drops from the watering can.
  water: [
    { at: 0, duration: 0.07, from: 1300, to: 900, type: 'sine', gain: 0.6 },
    { at: 0.09, duration: 0.07, from: 1500, to: 1000, type: 'sine', gain: 0.5 },
    { at: 0.17, duration: 0.08, from: 1200, to: 820, type: 'sine', gain: 0.6 },
    { at: 0.27, duration: 0.07, from: 1400, to: 950, type: 'sine', gain: 0.4 },
  ],
  // Two quick rising notes of a small bird.
  chirp: [
    { at: 0, duration: 0.09, from: 2300, to: 3400, type: 'sine', gain: 0.5 },
    { at: 0.13, duration: 0.11, from: 2500, to: 3800, type: 'sine', gain: 0.5 },
  ],
  // A soft, nasal quack.
  quack: [
    {
      at: 0,
      duration: 0.16,
      from: 520,
      to: 330,
      type: 'sawtooth',
      gain: 0.35,
    },
    {
      at: 0.2,
      duration: 0.13,
      from: 500,
      to: 320,
      type: 'sawtooth',
      gain: 0.3,
    },
  ],
  // Two low, round notes of an owl.
  hoot: [
    { at: 0, duration: 0.28, from: 400, to: 360, type: 'sine' },
    { at: 0.4, duration: 0.42, from: 390, to: 330, type: 'sine' },
  ],
  // A small find glints.
  chime: [
    { at: 0, duration: 0.3, from: 1568, to: 1568, type: 'triangle', gain: 0.5 },
    {
      at: 0.08,
      duration: 0.36,
      from: 2093,
      to: 2093,
      type: 'triangle',
      gain: 0.4,
    },
  ],
};

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Plays one sound on a context that was created from a user gesture. */
export function playTones(context: AudioContext, sound: GardenSound): void {
  const master = context.createGain();
  master.gain.value = GARDEN_VOLUME;
  master.connect(context.destination);
  const now = context.currentTime;
  for (const tone of SOUND_TONES[sound]) {
    const start = now + tone.at;
    const end = start + tone.duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.from, start);
    oscillator.frequency.exponentialRampToValueAtTime(tone.to, end);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(tone.gain ?? 1, start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

/* Vibration --------------------------------------------------------------------- */

/** A light tap; reactions get a slightly longer, still gentle pattern. */
export const VIBRATION = {
  tap: 12,
  reaction: [14, 60, 14],
} as const;

export type GardenVibration = keyof typeof VIBRATION;

/** Vibrates only inside the native app; the Web Vibration API does the work. */
export function vibrateNative(
  kind: GardenVibration,
  native: boolean = isCapacitorNative(),
): boolean {
  if (!native || typeof navigator === 'undefined') return false;
  const pattern = VIBRATION[kind];
  try {
    return navigator.vibrate?.(pattern as number | number[]) === true;
  } catch {
    return false;
  }
}

/* Hook -------------------------------------------------------------------------- */

export interface GardenFeedback {
  /** Vibration exists only in the native app; its toggle is hidden elsewhere. */
  native: boolean;
  sound: boolean;
  vibration: boolean;
  setSound: (enabled: boolean) => void;
  setVibration: (enabled: boolean) => void;
  /** Plays a sound when sounds are on. Call it from a tap only. */
  play: (sound: GardenSound) => void;
  /** A light vibration when it is on and the app runs natively. */
  buzz: (kind: GardenVibration) => void;
}

export function useGardenFeedback(
  accountId: string,
  { native = isCapacitorNative() }: { native?: boolean } = {},
): GardenFeedback {
  const soundKey = gardenFeedbackKey(accountId, 'sound');
  const vibrationKey = gardenFeedbackKey(accountId, 'vibration');
  const [sound, setSoundState] = useState(() => readGardenFeedback(soundKey));
  const [vibration, setVibrationState] = useState(() =>
    readGardenFeedback(vibrationKey),
  );
  const context = useRef<AudioContext | null>(null);
  const settings = useRef({ sound, vibration, native });
  settings.current = { sound, vibration, native };
  // The audio context lives only while the garden is open.
  useEffect(
    () => () => {
      void context.current?.close().catch(() => undefined);
      context.current = null;
    },
    [],
  );
  // A choice synced from another device applies while the garden is open.
  useEffect(() => {
    const onSynced = (event: Event) => {
      const detail = (event as CustomEvent<SyncedGardenFeedback>).detail;
      if (detail?.key === soundKey) setSoundState(detail.enabled);
      if (detail?.key === vibrationKey) setVibrationState(detail.enabled);
    };
    window.addEventListener(CHANGE_EVENT, onSynced);
    return () => window.removeEventListener(CHANGE_EVENT, onSynced);
  }, [soundKey, vibrationKey]);

  const play = useCallback((name: GardenSound) => {
    if (!settings.current.sound) return;
    try {
      if (!context.current) {
        const Constructor = audioContextConstructor();
        if (!Constructor) return;
        context.current = new Constructor();
      }
      const audio = context.current;
      if (audio.state === 'suspended') void audio.resume();
      playTones(audio, name);
    } catch {
      /* Sound is a nicety; the garden works the same without it. */
    }
  }, []);

  const buzz = useCallback((kind: GardenVibration) => {
    if (!settings.current.vibration) return;
    vibrateNative(kind, settings.current.native);
  }, []);

  const setSound = useCallback(
    (enabled: boolean) => {
      setSoundState(enabled);
      saveGardenFeedback(soundKey, enabled);
      settings.current = { ...settings.current, sound: enabled };
      // The toggle itself is the gesture that may start audio; a soft chime confirms it.
      if (enabled) play('chime');
    },
    [play, soundKey],
  );

  const setVibration = useCallback(
    (enabled: boolean) => {
      setVibrationState(enabled);
      saveGardenFeedback(vibrationKey, enabled);
      settings.current = { ...settings.current, vibration: enabled };
      if (enabled) vibrateNative('tap', settings.current.native);
    },
    [vibrationKey],
  );

  return useMemo(
    () => ({
      native,
      sound,
      vibration: native && vibration,
      setSound,
      setVibration,
      play,
      buzz,
    }),
    [native, sound, vibration, setSound, setVibration, play, buzz],
  );
}
