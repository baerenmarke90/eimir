const MAX_COMPRESSION_MS = 120_000;
let compressionTail: Promise<unknown> = Promise.resolve();

const aborted = () => new DOMException('Upload aborted.', 'AbortError');

function run(
  file: File,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<File> {
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('./videoCompression.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      reject(new Error('Video preparation unavailable.'));
      return;
    }
    let settled = false;
    const finish = (result?: File, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
      if (result) resolve(result);
      else reject(error ?? aborted());
    };
    const cancel = () => finish();
    const timer = setTimeout(
      () => finish(undefined, new Error('Video preparation timed out.')),
      MAX_COMPRESSION_MS,
    );
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data?.type === 'progress' && Number.isFinite(data.progress))
        onProgress?.(Math.max(0, Math.min(100, data.progress)));
      else if (
        data?.type === 'done' &&
        data.buffer instanceof ArrayBuffer &&
        data.buffer.byteLength > 0 &&
        data.buffer.byteLength <= 250 * 1024 * 1024
      ) {
        finish(
          new File([data.buffer], file.name.replace(/\.[^.]+$/, '') + '.mp4', {
            type: 'video/mp4',
            lastModified: file.lastModified,
          }),
        );
      } else if (data?.type === 'original') finish(file);
      else if (data?.type !== 'progress')
        finish(undefined, new Error('Video preparation failed.'));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(undefined, new Error('Video preparation failed.'));
    };
    worker.onmessageerror = () =>
      finish(undefined, new Error('Video preparation failed.'));
    if (signal?.aborted) cancel();
    else {
      try {
        worker.postMessage(file);
      } catch {
        finish(undefined, new Error('Video preparation failed.'));
      }
    }
  });
}

/** One bounded codec worker at a time; cancellation also releases queued callers. */
export function compressVideoForUpload(
  file: File,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<File> {
  if (signal?.aborted) return Promise.reject(aborted());
  if (typeof Worker === 'undefined')
    return Promise.reject(new Error('Video preparation unavailable.'));
  const task = compressionTail.then(() => run(file, signal, onProgress));
  compressionTail = task.catch(() => undefined);
  if (!signal) return task;
  return new Promise((resolve, reject) => {
    const cancel = () => reject(aborted());
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    void task
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', cancel));
  });
}
