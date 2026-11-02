// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PlaceMapCanvas from './PlaceMapCanvas';

const state = vi.hoisted(() => ({
  width: 0,
  height: 0,
  resize: () => {},
  events: {} as Record<string, () => void>,
  fit: vi.fn(),
  invalidate: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('leaflet', () => {
  const map = {
    setView: vi.fn().mockReturnThis(),
    on: (events: string, callback: () => void) => {
      for (const event of events.split(' ')) state.events[event] = callback;
      return map;
    },
    fitBounds: state.fit,
    invalidateSize: state.invalidate,
    remove: state.remove,
  };
  const layer = () => ({
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    on: vi.fn().mockReturnThis(),
  });
  return {
    map: () => map,
    control: { zoom: layer },
    tileLayer: layer,
    layerGroup: layer,
    marker: () => ({ ...layer(), getElement: () => null }),
    divIcon: vi.fn(),
    latLngBounds: (points: unknown) => points,
  };
});
beforeEach(() => {
  state.width = state.height = 0;
  state.events = {};
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => state.width,
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => state.height,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        state.resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('waits for measurable dialog layout, then fits every location without a timer', () => {
  render(
    <PlaceMapCanvas
      locations={[
        { id: 'south', label: 'South', latitude: 49, longitude: 7, count: 1 },
        { id: 'north', label: 'North', latitude: 54, longitude: 8, count: 1 },
      ]}
    />,
  );
  expect(state.fit).not.toHaveBeenCalled();
  state.width = 390;
  state.height = 740;
  act(() => state.resize());
  expect(state.fit).toHaveBeenLastCalledWith(
    [
      [49, 7],
      [54, 8],
    ],
    expect.objectContaining({ maxZoom: 12, animate: false }),
  );
  state.width = 740;
  act(() => state.resize());
  expect(state.fit).toHaveBeenCalledTimes(2);
});

it('preserves deliberate user pan/zoom across later resizes', () => {
  state.width = 390;
  state.height = 740;
  render(
    <PlaceMapCanvas
      locations={[
        { id: 'south', label: 'South', latitude: 49, longitude: 7, count: 1 },
      ]}
    />,
  );
  expect(state.fit).toHaveBeenCalledTimes(1);
  act(() => state.events.zoomstart());
  state.height = 640;
  act(() => state.resize());
  expect(state.invalidate).toHaveBeenCalledTimes(2);
  expect(state.fit).toHaveBeenCalledTimes(1);
});
