import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoSourcesApi } from '../api/generated/apis/PhotoSourcesApi';
import {
  photoFile,
  readPhotoThumbnail,
  waitForPhotoPoll,
} from './photoSources';

afterEach(() => vi.useRealTimers());

describe('private photo source tasks', () => {
  it('cancels an owned poll timer immediately', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const poll = waitForPhotoPoll(60, controller.signal);
    controller.abort(new Error('closed'));
    await expect(poll).rejects.toThrow('closed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects unsupported or empty bytes before handing a File to staging', () => {
    expect(() => photoFile(new Blob([], { type: 'image/jpeg' }), 0)).toThrow();
    expect(() =>
      photoFile(new Blob(['movie'], { type: 'video/mp4' }), 0),
    ).toThrow();
    const file = photoFile(new Blob(['image'], { type: 'image/webp' }), 1);
    expect(file.name).toBe('photo-2.webp');
    expect(file.type).toBe('image/webp');
  });

  it('bounds thumbnail concurrency and removes cancelled queued work', async () => {
    const finish: Array<(blob: Blob) => void> = [];
    const read = vi.fn(
      (_request: { itemId: string }, _options: { signal: AbortSignal }) =>
        new Promise<Blob>((resolve) => finish.push(resolve)),
    );
    const api = { readSelectedPhoto: read } as unknown as PhotoSourcesApi;
    const controllers = Array.from({ length: 4 }, () => new AbortController());
    const tasks = controllers.map((controller, index) =>
      readPhotoThumbnail(
        api,
        'space',
        'selection',
        String(index),
        controller.signal,
      ),
    );
    expect(read).toHaveBeenCalledTimes(2);
    controllers[2].abort(new Error('scrolled away'));
    await expect(tasks[2]).rejects.toThrow('scrolled away');
    finish[0](new Blob(['first']));
    await tasks[0];
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(read.mock.calls[2][0]).toMatchObject({ itemId: '3' });
    finish[1](new Blob(['second']));
    finish[2](new Blob(['fourth']));
    await Promise.all([tasks[1], tasks[3]]);
  });
});
