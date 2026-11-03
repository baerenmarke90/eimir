// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MediaGallery } from './MediaGallery';
import { i18n } from '../i18n';
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
    () => undefined,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('loads posters for neighbours and owns exactly one transient player only while fullscreen', async () => {
  const loadMedia = vi.fn(async () => {
    throw new Error('No original video may enter the image loader');
  });
  const loadPoster = vi.fn(async (id: string) => 'blob:poster-' + id);
  const loadPlayback = vi.fn(async (id: string) => ({
    url: '/playback/' + id,
    expiresAt: new Date(Date.now() + 60000),
  }));
  const items = ['one', 'two', 'three'].map((id) => ({
    id,
    mediaType: 'VIDEO' as const,
    isSensitive: false,
    hasThumbnail: true,
  }));
  const view = render(
    <MediaGallery
      items={items}
      loadMedia={loadMedia}
      loadPoster={loadPoster}
      loadPlayback={loadPlayback}
    />,
  );
  await waitFor(() => expect(loadPoster).toHaveBeenCalledTimes(3));
  expect(loadPlayback).not.toHaveBeenCalled();
  fireEvent.click(
    view.container.querySelector<HTMLButtonElement>(
      '.is-active',
    ) as HTMLButtonElement,
  );
  await waitFor(() =>
    expect(document.querySelectorAll('video')).toHaveLength(1),
  );
  expect(loadPlayback.mock.calls.map(([id]) => id)).toEqual(['one']);
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  await waitFor(() =>
    expect(loadPlayback.mock.calls.map(([id]) => id)).toEqual(['one', 'two']),
  );
  expect(document.querySelectorAll('video')).toHaveLength(1);
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() =>
    expect(document.querySelectorAll('video')).toHaveLength(0),
  );
  expect(loadMedia).not.toHaveBeenCalled();
});
it('does not fetch a sensitive poster or grant before explicit reveal', async () => {
  const loadPoster = vi.fn(async () => 'blob:private-poster');
  const loadPlayback = vi.fn(async () => ({
    url: '/private',
    expiresAt: new Date(Date.now() + 60000),
  }));
  const view = render(
    <MediaGallery
      items={[
        {
          id: 'private',
          mediaType: 'VIDEO',
          isSensitive: true,
          hasThumbnail: true,
        },
      ]}
      loadMedia={vi.fn()}
      loadPoster={loadPoster}
      loadPlayback={loadPlayback}
    />,
  );
  expect(loadPoster).not.toHaveBeenCalled();
  fireEvent.click(
    view.container.querySelector<HTMLButtonElement>(
      '.media-gallery-carousel-slide.is-active',
    ) as HTMLButtonElement,
  );
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(loadPlayback).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: i18n.t('video.show'),
    }),
  );
  await waitFor(() => expect(loadPlayback).toHaveBeenCalledTimes(1));
  expect(loadPoster).toHaveBeenCalledTimes(1);
});
