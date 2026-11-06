import { createContext } from 'react';

export const AudioProcessingContext = createContext(false);
export const VOICE_MAX_BYTES = 20 * 1024 * 1024;
export const VOICE_MAX_SECONDS = 180;
export const VOICE_ACCEPT = 'audio/*,.opus,.ogg,.m4a,.mp3,.wav,.webm,.aac';
const types: Record<string, string> = {
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
};
export function voiceFile(file: File): File {
  const declared = file.type.split(';')[0].toLowerCase();
  const mime =
    declared === 'audio/x-m4a'
      ? 'audio/mp4'
      : declared === 'audio/x-wav'
        ? 'audio/wav'
        : declared === 'application/ogg'
          ? 'audio/ogg'
          : Object.values(types).includes(declared)
            ? declared
            : types[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
  if (!mime) throw new Error('unsupported');
  if (!file.size) throw new Error('empty');
  if (file.size > VOICE_MAX_BYTES) throw new Error('tooLarge');
  return new File(
    [file],
    `voice.${Object.keys(types).find((key) => types[key] === mime)}`,
    { type: mime },
  );
}
export function voiceTime(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function audioPeaks(buffer: AudioBuffer, count = 48): number[] {
  const samples = buffer.getChannelData(0);
  const stride = Math.max(1, Math.ceil(samples.length / count));
  return Array.from({ length: count }, (_, i) => {
    let peak = 0;
    for (
      let j = i * stride;
      j < Math.min(samples.length, (i + 1) * stride);
      j++
    )
      peak = Math.max(peak, Math.abs(samples[j]));
    return peak;
  });
}
