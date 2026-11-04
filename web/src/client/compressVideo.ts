import {
  BlobSource,
  BufferTarget,
  canEncodeVideo,
  Conversion,
  Input,
  Logging,
  LogLevel,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  Quality,
} from 'mediabunny';

/** Local optimization only. The server still validates every uploaded byte. */
export async function compressVideo(
  file: File,
  onProgress: (progress: number) => void,
): Promise<ArrayBuffer | null> {
  // The dedicated worker must never print private container or codec details.
  Logging.level = LogLevel.Silent;
  const input = new Input({
    formats: [MP4, QTFF],
    source: new BlobSource(file),
  });
  let output: Output | undefined;
  try {
    const videos = await input.getVideoTracks();
    const audio = await input.getAudioTracks();
    if (
      videos.length !== 1 ||
      audio.length > 1 ||
      (await input.getTracks()).length !== videos.length + audio.length
    )
      return null;
    const video = videos[0];
    if (
      (await video.getCodec()) !== 'avc' ||
      (await video.hasHighDynamicRange()) ||
      (audio.length && (await audio[0].getCodec()) !== 'aac')
    )
      return null;
    const duration = await input.computeDuration();
    const width = await video.getDisplayWidth(),
      height = await video.getDisplayHeight();
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 180 ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      Math.min(width, height) <= 0 ||
      Math.max(width, height) > 3840 ||
      Math.min(width, height) > 2160 ||
      !(await video.canDecode())
    )
      return null;
    const scale = Math.min(
      1,
      1920 / Math.max(width, height),
      1080 / Math.min(width, height),
    );
    if (scale === 1 && (file.size * 8) / duration <= 4_250_000) return null;
    const dimensions = {
      width: Math.max(2, Math.floor((width * scale) / 2) * 2),
      height: Math.max(2, Math.floor((height * scale) / 2) * 2),
    };
    const quality = new Quality({
      bitrate: 4_000_000,
      bitrateMode: 'variable',
    });
    if (
      !(await canEncodeVideo('avc', { ...dimensions, quality, frameRate: 30 }))
    )
      return null;
    const target = new BufferTarget();
    const maxBytes = Math.min(100 * 1024 * 1024, Math.floor(file.size * 0.9));
    target.on('write', ({ end }) => {
      if (end > maxBytes)
        throw new Error('Local video output exceeds its optimization budget.');
    });
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        ...dimensions,
        fit: 'contain',
        codec: 'avc',
        quality,
        frameRate: 30,
        allowTransformationMetadata: false,
      },
      audio: { codec: 'aac' },
      tags: {},
      showWarnings: false,
    });
    // Never replace the user's recording with a silent or incomplete conversion.
    if (!conversion.isValid || conversion.discardedTracks.length) return null;
    conversion.onProgress = (progress) =>
      onProgress(Math.round(progress * 100));
    await conversion.execute();
    const buffer = target.buffer;
    return buffer && buffer.byteLength > 0 && buffer.byteLength <= maxBytes
      ? buffer
      : null;
  } finally {
    input.dispose();
    if (output && output.state !== 'finalized') await output.cancel();
  }
}
