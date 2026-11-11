// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import storyProducts from '../i18n/locales/storyProducts';
import sensitiveMedia from '../i18n/locales/sensitiveMedia';
import { MediaGallery, type GalleryMediaItem } from './MediaGallery';

const labels = storyProducts.gallery;
const images: GalleryMediaItem[] = Array.from({ length: 6 }, (_, index) => ({
  id: String(index),
  mediaType: 'IMAGE',
  isSensitive: false,
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

it('selects the exact photo from position dots and leaves the active dot unchanged', async () => {
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  const settled = vi.fn();
  const load = vi.fn(async (id: string) => `blob:${id}`);
  const view = render(
    <MediaGallery
      presentation="composer"
      items={images.slice(0, 3)}
      loadMedia={load}
      onSettledMediaChange={settled}
    />,
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  const dot = (index: number) =>
    screen.getByRole('button', {
      name: labels.selectItem
        .replace('{{index}}', String(index))
        .replace('{{count}}', '3'),
    });
  const activePhoto = () =>
    view.container
      .querySelector('.media-gallery-carousel-slide.is-active')
      ?.getAttribute('data-carousel-index');
  expect(activePhoto()).toBe('0');
  expect(dot(1).getAttribute('aria-current')).toBe('true');

  fireEvent.click(dot(3));
  expect(activePhoto()).toBe('2');
  expect(dot(3).getAttribute('aria-current')).toBe('true');
  expect(settled.mock.calls).toEqual([['2']]);

  fireEvent.click(dot(3));
  expect(activePhoto()).toBe('2');
  expect(dot(3).getAttribute('aria-current')).toBe('true');
  expect(settled.mock.calls).toEqual([['2']]);

  fireEvent.click(dot(1));
  expect(activePhoto()).toBe('0');
  expect(dot(1).getAttribute('aria-current')).toBe('true');
  expect(settled.mock.calls).toEqual([['2'], ['0']]);
});

it('discards a previous scroll completion when an editor selects another photo', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  const settled = vi.fn();
  const load = vi.fn(() => new Promise<string>(() => {}));
  const props = {
    items: images,
    loadMedia: load,
    onSettledMediaChange: settled,
  };
  const view = render(<MediaGallery {...props} initialMediaId="0" />);
  const track = view.container.querySelector<HTMLDivElement>(
    '.media-gallery-carousel-track',
  );
  try {
    if (!track) throw new Error('The carousel track must be rendered.');
    for (const [index, slide] of Array.from(track.children).entries())
      Object.defineProperty(slide, 'offsetLeft', { value: index * 100 });
    track.scrollLeft = 100;
    fireEvent.scroll(track);
    view.rerender(<MediaGallery {...props} initialMediaId="1" />);
    await act(async () => vi.advanceTimersByTime(100));
    expect(settled).not.toHaveBeenCalled();
    expect(
      view.container
        .querySelector('.is-active')
        ?.getAttribute('data-carousel-index'),
    ).toBe('1');

    fireEvent.pointerDown(track);
    track.scrollLeft = 300;
    fireEvent.scroll(track);
    await act(async () => vi.advanceTimersByTime(100));
    expect(settled).toHaveBeenCalledExactlyOnceWith('2');

    // Echoing the settled selection must not interrupt an ongoing gesture.
    view.rerender(<MediaGallery {...props} initialMediaId="2" />);
    track.scrollLeft = 400;
    fireEvent.scroll(track);
    await act(async () => vi.advanceTimersByTime(100));
    expect(settled.mock.calls).toEqual([['2'], ['3']]);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it('keeps the selected photo through a resize during transient scroll feedback', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  let resize: ResizeObserverCallback | undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const settled = vi.fn();
  const load = vi.fn(() => new Promise<string>(() => {}));
  const view = render(
    <MediaGallery
      items={images}
      initialMediaId="1"
      loadMedia={load}
      onSettledMediaChange={settled}
    />,
  );
  const track = view.container.querySelector<HTMLDivElement>(
    '.media-gallery-carousel-track',
  );
  try {
    if (!track || !resize)
      throw new Error('The carousel must observe its size.');
    let width = 100;
    Object.defineProperty(track, 'clientWidth', { get: () => width });
    for (const [index, slide] of Array.from(track.children).entries())
      Object.defineProperty(slide, 'offsetLeft', { value: index * 100 });
    // A native resnap can briefly report the neighbouring slide before resize.
    fireEvent.pointerDown(track);
    track.scrollLeft = 100;
    fireEvent.scroll(track);
    await act(async () => vi.advanceTimersByTime(20));
    expect(
      view.container
        .querySelector('.is-active')
        ?.getAttribute('data-carousel-index'),
    ).toBe('0');

    width += 20;
    act(() => resize?.([], {} as ResizeObserver));
    expect(track.scrollLeft).toBe(200);
    await act(async () => vi.advanceTimersByTime(100));
    expect(settled).not.toHaveBeenCalled();
    expect(
      view.container
        .querySelector('.is-active')
        ?.getAttribute('data-carousel-index'),
    ).toBe('1');

    // The next completed native swipe still updates the editor selection.
    fireEvent.pointerDown(track);
    track.scrollLeft = 300;
    fireEvent.scroll(track);
    await act(async () => vi.advanceTimersByTime(100));
    expect(settled).toHaveBeenCalledExactlyOnceWith('2');
    width += 20;
    act(() => resize?.([], {} as ResizeObserver));
    expect(track.scrollLeft).toBe(300);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it('retains an explicit selection when the browser resnaps without horizontal input', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  const settled = vi.fn();
  const load = vi.fn(() => new Promise<string>(() => {}));
  const view = render(
    <MediaGallery
      items={images}
      initialMediaId="1"
      loadMedia={load}
      onSettledMediaChange={settled}
    />,
  );
  const track = view.container.querySelector<HTMLDivElement>(
    '.media-gallery-carousel-track',
  );
  try {
    if (!track) throw new Error('The carousel track must be rendered.');
    for (const [index, slide] of Array.from(track.children).entries())
      Object.defineProperty(slide, 'offsetLeft', { value: index * 100 });
    fireEvent.wheel(track, { deltaY: 100 });
    track.scrollLeft = 100;
    fireEvent.scroll(track);
    await act(async () => vi.advanceTimersByTime(100));
    expect(settled).not.toHaveBeenCalled();
    expect(track.scrollLeft).toBe(200);
    expect(
      view.container
        .querySelector('.is-active')
        ?.getAttribute('data-carousel-index'),
    ).toBe('1');

    fireEvent.wheel(track, { deltaX: 100 });
    track.scrollLeft = 300;
    fireEvent.scroll(track);
    await act(async () => vi.advanceTimersByTime(100));
    expect(settled).toHaveBeenCalledExactlyOnceWith('2');
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
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

for (const inline of [false, true]) {
  it(`opens concealed composer photos directly in fullscreen with inline controls ${inline}`, async () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', { revokeObjectURL: revoke });
    const load = vi.fn(async (id: string) => `blob:${id}`);
    const view = render(
      <MediaGallery
        presentation="composer"
        showInlineSensitiveControl={inline ? undefined : false}
        resourceScopeKey={`sensitive-composer-${inline}`}
        items={[
          { id: 'protected-photo', mediaType: 'IMAGE', isSensitive: true },
        ]}
        loadMedia={load}
      />,
    );
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const stage = view.container.querySelector<HTMLButtonElement>(
      '.media-gallery-carousel-slide.is-active',
    );
    if (!stage) throw new Error('The native stage button must be available.');
    await waitFor(() =>
      expect(
        stage
          .querySelector('.sensitive-media-blurred img')
          ?.getAttribute('src'),
      ).toBe('blob:protected-photo'),
    );
    const inlineControl = () =>
      view.container.querySelector(
        '.media-gallery-carousel-viewport > .sensitive-media-control',
      );
    expect(Boolean(inlineControl())).toBe(inline);
    if (inline)
      expect(inlineControl()?.getAttribute('aria-label')).toBe(
        sensitiveMedia.show,
      );
    stage.focus();
    fireEvent.click(stage);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.sensitive-media-cover')).not.toBeNull();
    expect(dialog.querySelector('.media-lightbox-photo')).toBeNull();
    fireEvent.click(
      within(dialog).getByRole('button', { name: sensitiveMedia.show }),
    );
    await waitFor(() =>
      expect(
        dialog.querySelector('.media-lightbox-photo img')?.getAttribute('src'),
      ).toBe('blob:protected-photo'),
    );
    expect(dialog.querySelector('.sensitive-media-cover')).toBeNull();
    fireEvent.click(
      within(dialog).getByRole('button', { name: sensitiveMedia.hide }),
    );
    expect(dialog.querySelector('.sensitive-media-cover')).not.toBeNull();
    expect(dialog.querySelector('.media-lightbox-photo')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(stage));
    expect(stage.querySelector('.sensitive-media-cover')).not.toBeNull();
    expect(Boolean(inlineControl())).toBe(inline);
    expect(load).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:protected-photo');
  });
}

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
    index === 1
      ? { ...item, mediaType: 'VIDEO' as const, isSensitive: false }
      : item,
  );
  view.rerender(<MediaGallery items={mixed} loadMedia={load} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  expect(load.mock.lastCall?.[0]).toBe('5');
  fireEvent.click(screen.getByRole('button', { name: labels.next }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  expect(load.mock.lastCall?.[0]).toBe('2');
  expect(load.mock.calls.filter(([id]) => id === '1')).toHaveLength(1);
});

for (const reducedMotion of [false, true]) {
  it(`retains the keyboard destination through lightbox resize with reduced motion ${reducedMotion}`, async () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
    vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
    const observers = new Map<Element, ResizeObserverCallback>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: ResizeObserverCallback) {}
        observe(element: Element) {
          observers.set(element, this.callback);
        }
        disconnect() {}
      },
    );
    const load = vi.fn(() => new Promise<string>(() => {}));
    let width = 100;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
      () => width,
    );
    const view = render(
      <MediaGallery
        items={images}
        initialMediaId="1"
        loadMedia={load}
        dismissWithHistory={false}
      />,
    );
    try {
      const trigger = view.container.querySelector<HTMLButtonElement>(
        '.media-gallery-carousel-slide.is-active',
      );
      if (!trigger) throw new Error('The selected gallery trigger must exist.');
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog');
      const track = dialog.querySelector<HTMLDivElement>(
        '.media-lightbox-track',
      );
      if (!track) throw new Error('The lightbox track must exist.');
      for (const [index, slide] of Array.from(track.children).entries())
        Object.defineProperty(slide, 'offsetLeft', {
          get: () => index * width,
        });
      track.scrollLeft = 200;
      track.scrollTo = vi.fn();
      const close = dialog.querySelector<HTMLButtonElement>(
        '.media-lightbox-close',
      );
      if (!close) throw new Error('The lightbox close control must exist.');
      expect(document.activeElement).toBe(close);
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      if (!reducedMotion)
        expect(track.scrollTo).toHaveBeenCalledWith({
          left: 300,
          behavior: 'smooth',
        });
      // Initial observer delivery is not a resize and must not cut motion short.
      act(() => observers.get(track)?.([], {} as ResizeObserver));
      expect(track.scrollLeft).toBe(reducedMotion ? 300 : 200);
      // A resize arrives before normal-motion scroll feedback reaches photo 3.
      width = 120;
      act(() => observers.get(track)?.([], {} as ResizeObserver));
      expect(track.scrollLeft).toBe(360);
      fireEvent.scroll(track);
      await act(async () => vi.advanceTimersByTime(100));
      expect(dialog.querySelector('.media-lightbox-counter')?.textContent).toBe(
        labels.counter.replace('{{index}}', '3').replace('{{count}}', '6'),
      );
      expect(document.activeElement).toBe(close);
      // Genuine input can interrupt explicit navigation and select another slide.
      fireEvent.pointerDown(track);
      track.scrollLeft = 480;
      fireEvent.scroll(track);
      await act(async () => vi.advanceTimersByTime(100));
      expect(dialog.querySelector('.media-lightbox-counter')?.textContent).toBe(
        labels.counter.replace('{{index}}', '4').replace('{{count}}', '6'),
      );
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(
        view.container
          .querySelector('.is-active')
          ?.getAttribute('data-carousel-index'),
      ).toBe('1');
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });
}
