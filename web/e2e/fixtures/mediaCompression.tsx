import { BlobSource, Input, MP4 } from 'mediabunny';
import { compressVideoForUpload } from '../../src/client/videoCompression';

/** Synthetic file only; exercised in the real browser's worker/codecs. */
export async function verifyLocalCompression() {
  const response = await fetch('/synthetic-compression-recording.mp4');
  const source = await response.blob();
  const original = new File(
    [source, new Uint8Array(8 * 1024 * 1024)],
    'recording.mp4',
    { type: 'video/mp4' },
  );
  const supported =
    typeof VideoEncoder !== 'undefined' &&
    (
      await VideoEncoder.isConfigSupported({
        codec: 'avc1.42001f',
        width: 96,
        height: 64,
        bitrate: 4_000_000,
        framerate: 30,
      })
    ).supported;
  const progress: number[] = [];
  const result = await compressVideoForUpload(original, undefined, (value) =>
    progress.push(value),
  );
  const input = new Input({ formats: [MP4], source: new BlobSource(result) });
  try {
    return {
      supported: Boolean(supported),
      originalSize: original.size,
      size: result.size,
      type: result.type,
      videoTracks: (await input.getVideoTracks()).length,
      audioTracks: (await input.getAudioTracks()).length,
      duration: await input.computeDuration(),
      progress,
    };
  } finally {
    input.dispose();
  }
}
