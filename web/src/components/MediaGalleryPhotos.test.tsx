// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MediaGallery } from './MediaGallery';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('custom previews load no originals until open, keep only neighbours, and revoke on close', async () => {
  const revoke = vi.fn();
  vi.stubGlobal('URL', { revokeObjectURL: revoke });
  const load = vi.fn(async (id: string) => `blob:${id}`);
  render(
    <MediaGallery
      items={Array.from({ length: 6 }, (_, i) => ({
        id: `${i}`,
        mediaType: 'IMAGE' as const,
      }))}
      loadMedia={load}
      renderPreviews={(open) => (
        <button type="button" onClick={() => open(2)}>
          Open photo
        </button>
      )}
    />,
  );
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Open photo'));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  expect(load.mock.calls.map(([id]) => id).sort()).toEqual(['1', '2', '3']);
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(revoke.mock.calls.map(([url]) => url).sort()).toEqual([
    'blob:1',
    'blob:2',
    'blob:3',
  ]);
  vi.unstubAllGlobals();
});

it('revokes a late original response after dismissal without publishing it', async () => {
  const revoke = vi.fn();
  vi.stubGlobal('URL', { revokeObjectURL: revoke });
  let resolve!: (value: string) => void;
  const load = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  render(
    <MediaGallery
      items={[{ id: 'one', mediaType: 'IMAGE' }]}
      loadMedia={load}
      renderPreviews={(open) => (
        <button type="button" onClick={() => open(0)}>
          Open photo
        </button>
      )}
    />,
  );
  fireEvent.click(screen.getByText('Open photo'));
  await waitFor(() => expect(load).toHaveBeenCalledOnce());
  fireEvent.keyDown(window, { key: 'Escape' });
  await act(async () => {
    resolve('blob:late');
  });
  expect(revoke).toHaveBeenCalledWith('blob:late');
  expect(screen.queryByRole('dialog')).toBeNull();
  vi.unstubAllGlobals();
});
