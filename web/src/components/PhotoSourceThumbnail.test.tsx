// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoSourcesApi } from '../api/generated/apis/PhotoSourcesApi';
import { SourceThumbnail } from './PhotoSourcePicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderThumbnail(
  read: ReturnType<typeof vi.fn>,
  signal = new AbortController().signal,
) {
  return render(
    <SourceThumbnail
      api={{ readSelectedPhoto: read } as unknown as PhotoSourcesApi}
      spaceId="space"
      selectionId="selection"
      itemId="photo"
      signal={signal}
    />,
  );
}

describe('temporary source thumbnail ownership', () => {
  it('retains an accepted preview when it leaves and reenters the viewport, and revokes on close', async () => {
    let notify!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:preview');
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    const read = vi
      .fn()
      .mockResolvedValue(new Blob(['image'], { type: 'image/jpeg' }));
    const view = renderThumbnail(read);
    expect(read).not.toHaveBeenCalled();
    const intersection = (visible: boolean) =>
      act(() =>
        notify(
          [{ isIntersecting: visible } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      );
    intersection(true);
    await waitFor(() =>
      expect(view.container.querySelector('img')?.src).toBe('blob:preview'),
    );
    intersection(false);
    intersection(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:preview');
  });

  it('offers explicit retry after a failed read, including a browser without an observer', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recovered');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(new Blob(['image']));
    const view = renderThumbnail(read);
    const retry = await screen.findByRole('button', {
      name: 'Erneut versuchen',
    });
    expect(read).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() =>
      expect(view.container.querySelector('img')?.src).toBe('blob:recovered'),
    );
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not publish late bytes after the source task is cancelled', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    let finish!: (blob: Blob) => void;
    const read = vi.fn().mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        }),
    );
    const create = vi.spyOn(URL, 'createObjectURL');
    const owner = new AbortController();
    const view = renderThumbnail(read, owner.signal);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    owner.abort();
    await act(async () => finish(new Blob(['late'])));
    expect(create).not.toHaveBeenCalled();
    expect(view.container.querySelector('img')).toBeNull();
  });
});
