// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ZoomablePhoto } from './ZoomablePhoto';

const state = vi.hoisted(() => ({
  scale: 1,
  zoom: vi.fn(),
  reset: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('@panzoom/panzoom/dist/panzoom.es.js', () => ({
  default: () => ({
    getScale: () => state.scale,
    zoomToPoint: state.zoom.mockImplementation(() => {
      state.scale = 2.5;
    }),
    reset: state.reset.mockImplementation(() => {
      state.scale = 1;
    }),
    setOptions: vi.fn(),
    destroy: state.destroy,
    resetStyle: vi.fn(),
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.scale = 1;
});
function touch(
  node: Element,
  type: string,
  at: number,
  x = 80,
  y = 90,
  pointerId = 1,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({
    pointerType: 'touch',
    pointerId,
    clientX: x,
    clientY: y,
    timeStamp: at,
  }))
    Object.defineProperty(event, key, { value });
  fireEvent(node, event);
}
function tap(node: Element, at: number, x = 80, y = 90) {
  touch(node, 'pointerdown', at, x, y);
  touch(node, 'pointerup', at + 30, x, y);
}
function photo() {
  render(<ZoomablePhoto src="synthetic-photo.jpg" alt="Synthetic photo" />);
  return screen.getByRole('img');
}

it('toggles focal zoom and fit from real touch taps even without any synthesized click', () => {
  const image = photo();
  tap(image, 0);
  expect(state.zoom).not.toHaveBeenCalled();
  tap(image, 120, 82, 91);
  expect(state.zoom).toHaveBeenCalledExactlyOnceWith(
    2.5,
    expect.objectContaining({ clientX: 82, clientY: 91 }),
    { animate: false },
  );
  tap(image, 600);
  tap(image, 720);
  expect(state.reset).toHaveBeenCalledExactlyOnceWith({ animate: false });
});
it('ignores compatibility dblclick after a recognized touch pair but retains mouse double click', () => {
  const image = photo();
  tap(image, 0);
  tap(image, 120);
  fireEvent.doubleClick(image, { clientX: 80, clientY: 90 });
  expect(state.scale).toBe(2.5);
  const mouse = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(mouse, 'pointerType', { value: 'mouse' });
  fireEvent(image, mouse);
  fireEvent.doubleClick(image, { clientX: 80, clientY: 90 });
  expect(state.scale).toBe(1);
});
it.each(['pan', 'pinch', 'cancel', 'long-press', 'distant', 'late', 'control'])(
  'does not interpret %s as a touch double tap',
  (kind) => {
    const image = photo();
    tap(image, 0);
    if (kind === 'pan') {
      touch(image, 'pointerdown', 120);
      touch(image, 'pointermove', 140, 125);
      touch(image, 'pointerup', 160, 80);
    } else if (kind === 'pinch') {
      touch(image, 'pointerdown', 120);
      touch(image, 'pointerdown', 130, 120, 90, 2);
      touch(image, 'pointerup', 150, 80);
      touch(image, 'pointerup', 160, 120, 90, 2);
    } else if (kind === 'cancel') {
      touch(image, 'pointerdown', 120);
      touch(image, 'pointercancel', 140);
    } else if (kind === 'long-press') {
      touch(image, 'pointerdown', 120);
      touch(image, 'pointerup', 600);
    } else if (kind === 'distant') tap(image, 120, 250, 300);
    else if (kind === 'late') tap(image, 600);
    else tap(screen.getAllByRole('button')[0], 120);
    expect(state.zoom).not.toHaveBeenCalled();
    expect(state.reset).not.toHaveBeenCalled();
  },
);
it('discards an unfinished pair on image replacement and removes gesture listeners on close', () => {
  const view = render(<ZoomablePhoto src="first.jpg" alt="Synthetic photo" />);
  tap(screen.getByRole('img'), 0);
  view.rerender(<ZoomablePhoto src="second.jpg" alt="Synthetic photo" />);
  const image = screen.getByRole('img');
  tap(image, 120);
  expect(state.zoom).not.toHaveBeenCalled();
  view.unmount();
  tap(image, 200);
  expect(state.zoom).not.toHaveBeenCalled();
  expect(state.destroy).toHaveBeenCalledTimes(2);
});
