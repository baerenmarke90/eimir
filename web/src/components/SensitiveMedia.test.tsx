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
import userEvent from '@testing-library/user-event';
import { MediaGallery } from './MediaGallery';
import { MemoryPreview } from './MemoryPreview';
import { SensitiveMediaCheckbox } from './SensitiveMedia';

const items = [
  { id: 'sensitive', mediaType: 'IMAGE' as const, isSensitive: true },
  { id: 'ordinary', mediaType: 'IMAGE' as const, isSensitive: false },
  { id: 'neighbor', mediaType: 'IMAGE' as const, isSensitive: true },
];
const loadMedia = async (id: string) => `blob:${id}`;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('conceals on first render, reveals only one item and keeps the same focused button on hide', async () => {
  const view = render(<MediaGallery items={items} loadMedia={loadMedia} />);
  await waitFor(() =>
    expect(
      view.container.querySelector('.is-active .sensitive-media-blurred img'),
    ).not.toBeNull(),
  );
  expect(
    view.container.querySelector('.is-active img')?.getAttribute('alt'),
  ).toBe('');
  expect(
    view.container.querySelector(
      '[data-carousel-index="1"] .sensitive-media-cover',
    ),
  ).toBeNull();
  const button = screen.getByRole('button', { name: 'Bild anzeigen' });
  button.focus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: 'Wieder verbergen' })).toBe(button);
  expect(document.activeElement).toBe(button);
  expect(
    view.container.querySelector('.is-active .sensitive-media-cover'),
  ).toBeNull();
  expect(
    view.container.querySelector(
      '[data-carousel-index="2"] .sensitive-media-cover',
    ),
  ).not.toBeNull();
  await userEvent.keyboard(' ');
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(
    view.container.querySelector('.is-active .sensitive-media-cover'),
  ).not.toBeNull();
});

it('shares reveal with full screen and resets on background without moving the gallery', async () => {
  const view = render(<MediaGallery items={items} loadMedia={loadMedia} />);
  await waitFor(() =>
    expect(view.container.querySelector('.is-active img')).not.toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bild anzeigen' }));
  fireEvent.click(view.container.querySelector('.is-active')!);
  const dialog = screen.getByRole('dialog');
  expect(
    within(dialog).getByRole('button', { name: 'Wieder verbergen' }),
  ).toBeTruthy();
  const track = view.container.querySelector('.media-gallery-carousel-track')!;
  track.scrollLeft = 123;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(
    within(dialog).getByRole('button', { name: 'Bild anzeigen' }),
  ).toBeTruthy();
  expect(track.scrollLeft).toBe(123);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});

it('retains reveal on ordinary focus changes and closing full screen within the flow', async () => {
  const view = render(<MediaGallery items={items} loadMedia={loadMedia} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bild anzeigen' }));
  fireEvent.blur(window);
  expect(screen.getByRole('button', { name: 'Wieder verbergen' })).toBeTruthy();
  fireEvent.click(view.container.querySelector('.is-active')!);
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button', { name: 'Wieder verbergen' })).toBeTruthy();
});

it('resets on pagehide, scope change, reclassification and leaving/reentering', () => {
  const view = render(
    <MediaGallery items={items} resourceScopeKey="one" loadMedia={loadMedia} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bild anzeigen' }));
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(screen.getByRole('button', { name: 'Bild anzeigen' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Bild anzeigen' }));
  view.rerender(
    <MediaGallery items={items} resourceScopeKey="two" loadMedia={loadMedia} />,
  );
  expect(screen.getByRole('button', { name: 'Bild anzeigen' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Bild anzeigen' }));
  view.rerender(
    <MediaGallery
      items={items.map((item) => ({ ...item, isSensitive: false }))}
      resourceScopeKey="two"
      loadMedia={loadMedia}
    />,
  );
  view.rerender(
    <MediaGallery items={items} resourceScopeKey="two" loadMedia={loadMedia} />,
  );
  expect(screen.getByRole('button', { name: 'Bild anzeigen' })).toBeTruthy();
  view.unmount();
  render(
    <MediaGallery items={items} resourceScopeKey="two" loadMedia={loadMedia} />,
  );
  expect(screen.getByRole('button', { name: 'Bild anzeigen' })).toBeTruthy();
});

it('loads marked previews only behind blur and keeps unknown classification opaque', async () => {
  const loadImage = vi.fn().mockResolvedValue('blob:marked');
  const view = render(
    <MemoryPreview
      memoryId="memory"
      attachmentId="image"
      isSensitive
      loadImage={loadImage}
    />,
  );
  expect(screen.getByText('Sensibler Inhalt')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
  await waitFor(() =>
    expect(
      view.container.querySelector('.sensitive-media-blurred img'),
    ).not.toBeNull(),
  );
  expect(screen.queryByRole('img')).toBeNull();
  loadImage.mockClear();
  view.rerender(
    <MemoryPreview
      memoryId="memory"
      attachmentId="image"
      loadImage={loadImage}
    />,
  );
  expect(screen.getByText('Sensibler Inhalt')).toBeTruthy();
  expect(loadImage).not.toHaveBeenCalled();
});

it('keeps checkbox changes as draft input until the containing form is submitted', async () => {
  const save = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={save}>
      <SensitiveMediaCheckbox name="sensitive" checked={false} />
      <button type="submit">Save</button>
    </form>,
  );
  await userEvent.click(screen.getByRole('checkbox'));
  expect(save).not.toHaveBeenCalled();
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(save).toHaveBeenCalledTimes(1);
});
