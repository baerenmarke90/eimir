import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    WorkerStub.instances.push(this);
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}

const recording = () =>
  new File([new Uint8Array(8 * 1024 * 1024)], 'our-video.mov', {
    type: 'video/quicktime',
    lastModified: 42,
  });

beforeEach(() => {
  vi.resetModules();
  WorkerStub.instances = [];
  vi.stubGlobal('Worker', WorkerStub);
  vi.stubGlobal('VideoEncoder', class {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('private on-device video preparation', () => {
  it('uses a smaller completed MP4, reports progress and releases the worker', async () => {
    const { compressVideoForUpload } = await import('./videoCompression');
    const original = recording(),
      progress = vi.fn();
    const result = compressVideoForUpload(original, undefined, progress);
    await vi.waitFor(() => expect(WorkerStub.instances).toHaveLength(1));
    const worker = WorkerStub.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(original);
    worker.reply({ type: 'progress', progress: 64 });
    worker.reply({ type: 'done', buffer: new Uint8Array([1, 2, 3]).buffer });
    const prepared = await result;
    expect(prepared.name).toBe('our-video.mp4');
    expect(prepared.type).toBe('video/mp4');
    expect(prepared.lastModified).toBe(42);
    expect(prepared.size).toBe(3);
    expect(original.type).toBe('video/quicktime');
    expect(progress).toHaveBeenCalledWith(64);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('keeps the original on unsupported, failed or uneconomical conversion', async () => {
    const { compressVideoForUpload } = await import('./videoCompression');
    for (const response of [
      { type: 'fallback' },
      { type: 'done', buffer: new ArrayBuffer(8 * 1024 * 1024) },
      { type: 'done', buffer: new ArrayBuffer(0) },
    ]) {
      const original = recording();
      const result = compressVideoForUpload(original);
      await vi.waitFor(() =>
        expect(WorkerStub.instances.at(-1)?.postMessage).toHaveBeenCalled(),
      );
      // Wait for this call's queued worker rather than a previously completed one.
      await Promise.resolve();
      WorkerStub.instances.at(-1)?.reply(response);
      expect(await result).toBe(original);
    }
  });

  it('cancels active and queued work without starting a second codec worker', async () => {
    const { compressVideoForUpload } = await import('./videoCompression');
    const first = new AbortController(),
      queued = new AbortController();
    const active = compressVideoForUpload(recording(), first.signal);
    const waiting = compressVideoForUpload(recording(), queued.signal);
    const activeRejected = expect(active).rejects.toMatchObject({
      name: 'AbortError',
    });
    const queuedRejected = expect(waiting).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.waitFor(() => expect(WorkerStub.instances).toHaveLength(1));
    queued.abort();
    await queuedRejected;
    first.abort();
    await activeRejected;
    await Promise.resolve();
    expect(WorkerStub.instances).toHaveLength(1);
    expect(WorkerStub.instances[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('falls back after the bounded preparation time and removes its timer', async () => {
    vi.useFakeTimers();
    const { compressVideoForUpload } = await import('./videoCompression');
    const original = recording();
    const result = compressVideoForUpload(original);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await result).toBe(original);
    expect(WorkerStub.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start workers for small files or unavailable browser codecs', async () => {
    const { compressVideoForUpload } = await import('./videoCompression');
    const small = new File(['clip'], 'small.mp4', { type: 'video/mp4' });
    expect(await compressVideoForUpload(small)).toBe(small);
    vi.stubGlobal('VideoEncoder', undefined);
    const original = recording();
    expect(await compressVideoForUpload(original)).toBe(original);
    expect(WorkerStub.instances).toHaveLength(0);
  });
});
