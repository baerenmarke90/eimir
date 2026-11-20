import {
  adoptObjectUrl,
  createOwnedObjectUrl,
  type OwnedObjectUrl,
} from './objectUrlResource';

/** A worker that never answers must not keep an image from showing. */
const ANSWER_TIMEOUT_MS = 3_000;

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, (url: string | null) => void>();

function settleAll(): void {
  for (const answer of waiting.values()) answer(null);
  waiting.clear();
}

function objectUrlWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') {
    worker = null;
    return worker;
  }
  try {
    worker = new Worker(new URL('./objectUrl.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    worker = null;
    return worker;
  }
  worker.onmessage = ({ data }: MessageEvent<{ id: number; url: unknown }>) => {
    const answer = waiting.get(data?.id);
    if (!answer) {
      // Answered after the page already made its own URL: nobody owns it.
      if (typeof data?.url === 'string') URL.revokeObjectURL(data.url);
      return;
    }
    waiting.delete(data.id);
    answer(typeof data.url === 'string' ? data.url : null);
  };
  worker.onerror = () => {
    // Fall back to the page for this and every later URL.
    worker = null;
    settleAll();
  };
  return worker;
}

/**
 * The same single-owner Object URL as `createOwnedObjectUrl`, created in a
 * worker so a slow registration never blocks the page (#2063). Disposal
 * revokes it on the page at once, as before. Without a usable worker, or
 * when the worker does not answer in time, the page creates the URL itself.
 */
export function createOwnedObjectUrlOffThread(
  blob: Blob,
): Promise<OwnedObjectUrl> {
  const target = objectUrlWorker();
  if (!target) return Promise.resolve(createOwnedObjectUrl(blob));
  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (!waiting.delete(id)) return;
      resolve(createOwnedObjectUrl(blob));
    }, ANSWER_TIMEOUT_MS);
    waiting.set(id, (url) => {
      clearTimeout(timer);
      resolve(url ? adoptObjectUrl(url) : createOwnedObjectUrl(blob));
    });
    target.postMessage({ id, blob });
  });
}

/** Test seam: forget the worker so the next call decides again. */
export function resetOffThreadObjectUrlsForTests(): void {
  settleAll();
  worker = undefined;
}
