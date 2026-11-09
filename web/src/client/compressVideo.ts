import {
  BlobSource,
  BufferSource,
  BufferTarget,
  Conversion,
  canEncodeVideo,
  Input,
  Logging,
  LogLevel,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  Quality,
} from 'mediabunny';

/** Device-owned preparation. Null means a verified compatible original only. */
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
      throw new Error('Unsupported video tracks.');
    const video = videos[0];
    // Browser canvas HDR conversion is device-dependent. Never relabel it as SDR;
    // Android uses Media3's explicit tone mapper through the native preparation path.
    if (await video.hasHighDynamicRange())
      throw new Error('HDR preparation is unavailable in this browser.');
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
      Math.min(width, height) > 2160
    )
      throw new Error('Video exceeds preparation limits.');
    const scale = Math.min(
      1,
      1920 / Math.max(width, height),
      1080 / Math.min(width, height),
    );
    const dimensions = {
      width: Math.max(2, Math.floor((width * scale) / 2) * 2),
      height: Math.max(2, Math.floor((height * scale) / 2) * 2),
    };
    const bitrate = Math.max(
      1_500_000,
      Math.floor(
        (10_000_000 * dimensions.width * dimensions.height) / (1920 * 1080),
      ),
    );
    const configuration = await video.getDecoderConfig();
    const compatible =
      (await video.getCodec()) === 'avc' &&
      /^avc[13]\.(42|4d|58|64)/i.test(configuration?.codec ?? '') &&
      (!audio.length || (await audio[0].getCodec()) === 'aac');
    if (compatible && scale === 1 && (file.size * 8) / duration <= bitrate)
      return null;
    const quality = new Quality({ bitrate, bitrateMode: 'variable' });
    if (
      !(await video.canDecode()) ||
      !(await canEncodeVideo('avc', { ...dimensions, quality, frameRate: 30 }))
    )
      throw new Error('Video preparation is unavailable in this browser.');
    const target = new BufferTarget();
    const maxBytes = 250 * 1024 * 1024;
    target.on('write', ({ end }) => {
      if (end > maxBytes)
        throw new Error('Prepared video exceeds its size limit.');
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
        forceTranscode: true,
        hardwareAcceleration: 'prefer-hardware',
        allowTransformationMetadata: false,
      },
      audio: { codec: 'aac' },
      tags: {},
      showWarnings: false,
    });
    // Never replace the user's recording with a silent or incomplete conversion.
    if (!conversion.isValid || conversion.discardedTracks.length)
      throw new Error('Video preparation would discard media.');
    conversion.onProgress = (progress) =>
      onProgress(Math.round(progress * 100));
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0 || buffer.byteLength > maxBytes)
      throw new Error('Prepared video is empty or oversized.');
    const prepared = new Input({
      formats: [MP4],
      source: new BufferSource(buffer),
    });
    try {
      const tracks = await prepared.getVideoTracks();
      const sound = await prepared.getAudioTracks();
      if (
        tracks.length !== 1 ||
        sound.length !== audio.length ||
        (await tracks[0].getCodec()) !== 'avc' ||
        (await tracks[0].hasHighDynamicRange()) ||
        (sound.length && (await sound[0].getCodec()) !== 'aac') ||
        Math.abs((await prepared.computeDuration()) - duration) > 0.25 ||
        Math.max(
          await tracks[0].getDisplayWidth(),
          await tracks[0].getDisplayHeight(),
        ) > 1920 ||
        Math.min(
          await tracks[0].getDisplayWidth(),
          await tracks[0].getDisplayHeight(),
        ) > 1080
      )
        throw new Error('Prepared video did not preserve the recording.');
    } finally {
      prepared.dispose();
    }
    return buffer;
  } finally {
    input.dispose();
    if (output && output.state !== 'finalized') await output.cancel();
  }
}
