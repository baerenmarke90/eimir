// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
  view: vi.fn().mockReturnThis(),
  fly: vi.fn(),
  flyBounds: vi.fn(),
  stop: vi.fn(),
  marker: vi.fn(),
}));
vi.mock('leaflet', () => {
  const map = {
    setView: state.view,
    flyTo: state.fly,
    flyToBounds: state.flyBounds,
    stop: state.stop,
    getCenter: () => ({ lat: 49, lng: 7 }),
    getZoom: () => 15,
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
    marker: state.marker.mockImplementation(() => ({
      ...layer(),
      getElement: () => null,
    })),
    divIcon: (options: unknown) => options,
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

it('keeps a retained marker host and camera stable when only its photo changes', () => {
  state.width = 390;
  state.height = 740;
  const point = {
    id: 'south',
    label: 'South',
    latitude: 49,
    longitude: 7,
    count: 4,
  };
  const view = render(
    <PlaceMapCanvas
      locations={[{ ...point, preview: <span>First preview</span> }]}
    />,
  );
  const firstContent = state.marker.mock.calls[0][1].icon.html as HTMLElement;
  const firstHost = firstContent.firstElementChild;
  expect(firstHost?.textContent).toBe('First preview');
  view.rerender(
    <PlaceMapCanvas
      locations={[{ ...point, preview: <span>Second preview</span> }]}
    />,
  );
  expect(firstContent.firstElementChild).toBe(firstHost);
  expect(firstHost?.textContent).toBe('Second preview');
  expect(state.marker).toHaveBeenCalledTimes(1);
  expect(state.fit).toHaveBeenCalledTimes(1);
  expect(state.fly).not.toHaveBeenCalled();
});

it.each(['1100ms', '1.1s'])(
  'uses %s for one interruptible place flight and the overview reset',
  (duration) => {
    state.width = 390;
    state.height = 740;
    const computed = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = computed(element);
      return new Proxy(style, {
        get(target, key) {
          if (key === 'getPropertyValue')
            return (name: string) =>
              name === '--duration-map-camera'
                ? duration
                : target.getPropertyValue(name);
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    const points = [
      { id: 'south', label: 'South', latitude: 49, longitude: 7, count: 1 },
      { id: 'north', label: 'North', latitude: 54, longitude: 8, count: 1 },
    ];
    const view = render(<PlaceMapCanvas locations={points} />);
    view.rerender(
      <PlaceMapCanvas
        locations={[points[0]]}
        focus={{ latitude: 49, longitude: 7 }}
      />,
    );
    expect(state.fly).toHaveBeenLastCalledWith([49, 7], 15, { duration: 1.1 });
    expect(state.fit).toHaveBeenCalledTimes(1);
    expect(
      view.container.firstElementChild?.getAttribute('data-map-moving'),
    ).toBe('true');
    view.rerender(
      <PlaceMapCanvas
        locations={[points[1]]}
        focus={{ latitude: 54, longitude: 8 }}
      />,
    );
    expect(state.fly).toHaveBeenLastCalledWith([54, 8], 15, { duration: 1.1 });
    const viewport = view.container.querySelector('.place-map-viewport');
    if (!viewport) throw new Error('Map viewport must exist');
    fireEvent.pointerDown(viewport);
    expect(
      view.container.firstElementChild?.getAttribute('data-map-moving'),
    ).toBe('false');
    expect(state.stop).toHaveBeenCalledTimes(3);
    act(() => state.resize());
    expect(state.fly).toHaveBeenCalledTimes(2);
    expect(state.fit).toHaveBeenCalledTimes(1);
    view.rerender(<PlaceMapCanvas locations={points} />);
    expect(state.flyBounds).toHaveBeenCalledWith(
      [
        [49, 7],
        [54, 8],
      ],
      expect.objectContaining({ duration: 1.1, maxZoom: 12 }),
    );
    act(() => state.events.moveend());
    expect(
      view.container.firstElementChild?.getAttribute('data-map-moving'),
    ).toBe('false');
  },
);

it('restores the captured camera and uses immediate focus with reduced motion', () => {
  state.width = 390;
  state.height = 740;
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  const point = {
    id: 'south',
    label: 'South',
    latitude: 49,
    longitude: 7,
    count: 1,
  };
  const view = render(
    <PlaceMapCanvas
      locations={[point]}
      initialViewport={{ latitude: 49.1, longitude: 7.2, zoom: 13 }}
    />,
  );
  expect(state.view).toHaveBeenCalledWith([49.1, 7.2], 13);
  expect(state.fit).not.toHaveBeenCalled();
  view.rerender(
    <PlaceMapCanvas
      locations={[point]}
      focus={{ latitude: 49, longitude: 7 }}
    />,
  );
  expect(state.view).toHaveBeenLastCalledWith([49, 7], 15, { animate: false });
  expect(state.fly).not.toHaveBeenCalled();
});

it('restores a saved camera after a fullscreen dialog first becomes measurable', () => {
  render(
    <PlaceMapCanvas
      initialViewport={{ latitude: 49.1, longitude: 7.2, zoom: 16 }}
    />,
  );
  expect(state.view).toHaveBeenCalledWith([49.1, 7.2], 16);
  state.width = 390;
  state.height = 740;
  act(() => state.resize());
  expect(state.view).toHaveBeenLastCalledWith([49.1, 7.2], 16, {
    animate: false,
  });
  const calls = state.view.mock.calls.length;
  state.height = 640;
  act(() => state.resize());
  expect(state.view).toHaveBeenCalledTimes(calls);
});
