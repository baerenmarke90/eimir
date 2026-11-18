import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from './voiceNotes';

export function useVoiceRecorder(onReady: (file: File) => void) {
  const ready = useRef(onReady);
  ready.current = onReady;
  const generation = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'requesting' | 'recording' | 'stopping'
  >('idle');
  const [elapsed, setElapsed] = useState(0);
  const [wave, setWave] = useState<number[]>([]);
  const [error, setError] = useState('');
  const active = useRef(false);
  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => {
      track.stop();
    });
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
  }, []);
  function cancel() {
    generation.current++;
    active.current = false;
    if (recorder.current?.state !== 'inactive') {
      try {
        recorder.current?.stop();
      } catch {
        /* Already interrupted. */
      }
    }
    recorder.current = null;
    release();
    setPhase('idle');
  }
  function stop() {
    if (recorder.current?.state === 'recording') {
      setPhase('stopping');
      recorder.current.stop();
      release();
    }
  }
  async function start() {
    cancel();
    setError('');
    setElapsed(0);
    setWave([]);
    const owner = ++generation.current;
    active.current = true;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError('unavailable');
      setPhase('idle');
      active.current = false;
      return;
    }
    setPhase('requesting');
    try {
      const source = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (owner !== generation.current || !active.current) {
        source.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      stream.current = source;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(
        source,
        mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined,
      );
      recorder.current = capture;
      const chunks: Blob[] = [];
      let bytes = 0;
      let discarded = false;
      capture.ondataavailable = (event) => {
        if (owner !== generation.current || discarded) return;
        bytes += event.data.size;
        if (bytes > VOICE_MAX_BYTES) {
          discarded = true;
          stop();
          setError('tooLarge');
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      capture.onerror = () => {
        if (owner !== generation.current) return;
        discarded = true;
        cancel();
        setError('failed');
      };
      capture.onstop = () => {
        if (owner !== generation.current) return;
        release();
        recorder.current = null;
        active.current = false;
        setPhase('idle');
        if (discarded) return;
        if (!bytes) {
          setError('empty');
          return;
        }
        const mime = (capture.mimeType || mimeType || 'audio/webm').split(
          ';',
        )[0];
        const extension = mime.includes('mp4')
          ? 'm4a'
          : mime.includes('ogg')
            ? 'ogg'
            : 'webm';
        ready.current(new File(chunks, `voice.${extension}`, { type: mime }));
      };
      let analyser: AnalyserNode | undefined;
      if (typeof AudioContext !== 'undefined') {
        try {
          const audio = new AudioContext();
          context.current = audio;
          analyser = audio.createAnalyser();
          analyser.fftSize = 128;
          audio.createMediaStreamSource(source).connect(analyser);
        } catch {
          /* Waveform is optional; capture remains usable. */
        }
      }
      capture.start(250);
      setPhase('recording');
      const began = performance.now();
      timer.current = setInterval(() => {
        if (owner !== generation.current) return;
        const seconds = (performance.now() - began) / 1000;
        setElapsed(Math.min(seconds, VOICE_MAX_SECONDS));
        if (analyser) {
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          const peak = samples.reduce(
            (value, sample) => Math.max(value, Math.abs(sample)),
            0,
          );
          setWave((previous) => [...previous.slice(-47), peak]);
        }
        if (seconds >= VOICE_MAX_SECONDS - 1) stop();
      }, 100);
    } catch (cause) {
      if (owner !== generation.current) return;
      release();
      active.current = false;
      setPhase('idle');
      setError(
        cause instanceof DOMException &&
          ['NotAllowedError', 'SecurityError'].includes(cause.name)
          ? 'permission'
          : 'failed',
      );
    }
  }
  // Owner changes/unmount and late permission grants cannot retain the microphone.
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && active.current) {
        generation.current++;
        active.current = false;
        try {
          recorder.current?.stop();
        } catch {
          /* Already stopped. */
        }
        release();
        setPhase('idle');
        setError('failed');
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      generation.current++;
      active.current = false;
      try {
        recorder.current?.stop();
      } catch {
        /* Already stopped. */
      }
      release();
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [release]);
  return { phase, elapsed, wave, error, start, stop, cancel };
}
