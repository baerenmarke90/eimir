// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import storyProducts from '../i18n/locales/storyProducts';
import { MediaGallery, type GalleryMediaItem } from './MediaGallery';

const labels = storyProducts.gallery;
const images: GalleryMediaItem[] = Array.from({ length: 6 }, (_, index) => ({
  id: String(index),
  mediaType: 'IMAGE',
}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads only the visible carousel image and neighbours, moving and wrapping the window', async () => {
  const revoke = vi.fn();
  vi.stubGlobal('URL', { revokeObjectURL: revoke });
  const load = vi.fn(async (id: string) => `blob:${id}`);
  const view = render(<MediaGallery items={images} loadMedia={load} />);

  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  expect(load.mock.calls.map(([id]) => id)).toEqual(['0', '1', '5']);
  expect(
    view.container.querySelector('.is-active img')?.getAttribute('src'),
  ).toBe('blob:0');

  fireEvent.click(screen.getByRole('button', { name: labels.next }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  expect(load.mock.lastCall?.[0]).toBe('2');
  expect(revoke).toHaveBeenCalledWith('blob:5');
  expect(
    view.container.querySelector('.is-active img')?.getAttribute('src'),
  ).toBe('blob:1');

  fireEvent.click(screen.getByRole('button', { name: labels.previous }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(5));
  expect(load.mock.lastCall?.[0]).toBe('5');
  expect(revoke).toHaveBeenCalledWith('blob:2');
  fireEvent.click(screen.getByRole('button', { name: labels.previous }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(6));
  expect(load.mock.lastCall?.[0]).toBe('4');
  expect(revoke).toHaveBeenCalledWith('blob:1');
  expect(
    view.container.querySelector('.is-active img')?.getAttribute('src'),
  ).toBe('blob:5');
});

it('follows fullscreen navigation and restores the carousel window after close', async () => {
  const revoke = vi.fn();
  vi.stubGlobal('URL', { revokeObjectURL: revoke });
  const load = vi.fn(async (id: string) => `blob:${id}`);
  const view = render(<MediaGallery items={images} loadMedia={load} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  fireEvent.click(
    view.container.querySelector<HTMLButtonElement>('.is-active')!,
  );
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(3);

  fireEvent.keyDown(window, { key: 'ArrowRight' });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(5));
  expect(load.mock.calls.map(([id]) => id)).toEqual(['0', '1', '5', '2', '3']);
  expect(revoke).toHaveBeenCalledWith('blob:0');

  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(load).toHaveBeenCalledTimes(7));
  expect(load.mock.calls.slice(-2).map(([id]) => id)).toEqual(['0', '5']);
  expect(revoke).toHaveBeenCalledWith('blob:2');
  expect(revoke).toHaveBeenCalledWith('blob:3');
  expect(
    view.container.querySelector('.is-active img')?.getAttribute('src'),
  ).toBe('blob:0');
});

it('aborts out-of-window work and disposes late URLs without rendering them', async () => {
  const revoke = vi.fn();
  vi.stubGlobal('URL', { revokeObjectURL: revoke });
  const pending = new Map<
    string,
    { signal: AbortSignal; resolve: (url: string) => void }
  >();
  const load = vi.fn(
    (id: string, signal?: AbortSignal) =>
      new Promise<string>((resolve) => {
        pending.set(id, { signal: signal!, resolve });
      }),
  );
  const view = render(<MediaGallery items={images} loadMedia={load} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  fireEvent.click(screen.getByRole('button', { name: labels.next }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  expect(pending.get('5')?.signal.aborted).toBe(true);
  expect(pending.get('0')?.signal.aborted).toBe(false);

  await act(async () => pending.get('5')!.resolve('blob:late-5'));
  expect(revoke).toHaveBeenCalledWith('blob:late-5');
  expect(view.container.querySelector('img[src="blob:late-5"]')).toBeNull();
  view.unmount();
  expect(pending.get('0')?.signal.aborted).toBe(true);
  expect(pending.get('1')?.signal.aborted).toBe(true);
  expect(pending.get('2')?.signal.aborted).toBe(true);
});

it('keeps empty, short and mixed-media galleries bounded without loading videos', async () => {
  const revoke = vi.fn();
  vi.stubGlobal('URL', { revokeObjectURL: revoke });
  const load = vi.fn(async (id: string) => `blob:${id}`);
  const view = render(<MediaGallery items={[]} loadMedia={load} />);
  expect(load).not.toHaveBeenCalled();
  view.rerender(<MediaGallery items={images.slice(0, 1)} loadMedia={load} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  view.rerender(<MediaGallery items={images.slice(0, 2)} loadMedia={load} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  const mixed = images.map((item, index) =>
    index === 1 ? { ...item, mediaType: 'VIDEO' as const } : item,
  );
  view.rerender(<MediaGallery items={mixed} loadMedia={load} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  expect(load.mock.lastCall?.[0]).toBe('5');
  fireEvent.click(screen.getByRole('button', { name: labels.next }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  expect(load.mock.lastCall?.[0]).toBe('2');
  expect(load.mock.calls.filter(([id]) => id === '1')).toHaveLength(1);
});
