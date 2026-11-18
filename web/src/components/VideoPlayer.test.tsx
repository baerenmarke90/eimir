// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { VideoSource } from '../client/video';
import { i18n } from '../i18n';
import { VideoPlayer } from './VideoPlayer';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('replaces ownership synchronously and ignores a late grant for the previous Space', async () => {
  const pending: {
    resolve: (source: VideoSource) => void;
    signal: AbortSignal;
  }[] = [];
  const load = vi.fn(
    (_id: string, signal: AbortSignal) =>
      new Promise<VideoSource>((resolve) => pending.push({ resolve, signal })),
  );
  const view = render(
    <VideoPlayer id="same" scope="first-space" load={load} />,
  );
  await act(async () =>
    pending[0].resolve({
      url: '/first',
      expiresAt: new Date(Date.now() + 60000),
    }),
  );
  const first = view.container.querySelector('video')!;
  expect(first.getAttribute('src')).toBe('/first');
  view.rerender(<VideoPlayer id="same" scope="second-space" load={load} />);
  expect(view.container.querySelector('video')).toBeNull();
  expect(first.hasAttribute('src')).toBe(false);
  expect(pending[0].signal.aborted).toBe(true);
  view.rerender(<VideoPlayer id="other" scope="third-space" load={load} />);
  await act(async () =>
    pending[1].resolve({
      url: '/stale',
      expiresAt: new Date(Date.now() + 60000),
    }),
  );
  expect(view.container.querySelector('video')).toBeNull();
  await act(async () =>
    pending[2].resolve({
      url: '/current',
      expiresAt: new Date(Date.now() + 60000),
    }),
  );
  expect(view.container.querySelectorAll('video')).toHaveLength(1);
  expect(view.container.querySelector('video')!.getAttribute('src')).toBe(
    '/current',
  );
});

it('uses native controls without initial autoplay, pauses when hidden and offers deliberate retry', async () => {
  const load = vi.fn(async () => ({
    url: '/playback?token=scoped',
    expiresAt: new Date(Date.now() + 60000),
  }));
  const view = render(<VideoPlayer id="one" scope="space" load={load} />);
  await waitFor(() =>
    expect(view.container.querySelector('video')).toBeTruthy(),
  );
  const player = view.container.querySelector('video')!;
  expect(player.controls).toBe(true);
  expect(player.autoplay).toBe(false);
  expect(player.preload).toBe('none');
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  fireEvent(document, new Event('visibilitychange'));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  fireEvent.error(player);
  expect(player.hasAttribute('src')).toBe(false);
  expect(screen.getByText(i18n.t('video.unavailable'))).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('video.retry') }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(view.container.querySelector('video')).toBeTruthy(),
  );
  view.unmount();
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
});
