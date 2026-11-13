// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PlaceMapCanvas from './PlaceMapCanvas';

const state = vi.hoisted(() => ({
  width: 0,
  height: 0,
  resize: () => {},
  events: {} as Record<string, (event?: unknown) => void>,
  options: {} as Record<string, unknown>,
  fit: vi.fn(),
  mapResize: vi.fn(),
  remove: vi.fn(),
  jump: vi.fn(),
  fly: vi.fn(),
  camera: vi.fn(),
  stop: vi.fn(),
  marker: vi.fn(),
}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({
  default: '/worker.js',
}));
vi.mock('maplibre-gl', () => {
  const map = {
    jumpTo: state.jump,
    flyTo: state.fly,
    cameraForBounds: state.camera,
    stop: state.stop,
    getCenter: () => ({ lat: 49, lng: 7 }),
    getZoom: () => 14,
    getMinZoom: () => 0,
    getMaxZoom: () => 18,
    on: (event: string, callback: () => void) => {
      state.events[event] = callback;
      return map;
    },
    off: vi.fn(),
    setStyle: vi.fn(),
    addControl: vi.fn(),
    touchZoomRotate: { disableRotation: vi.fn() },
    fitBounds: state.fit,
    resize: state.mapResize,
    remove: state.remove,
  };
  class Bounds {
    points: number[][] = [];
    extend(point: number[]) {
      this.points.push(point);
      return this;
    }
  }
  return {
    setWorkerUrl: vi.fn(),
    MapLibreMap: function (options: Record<string, unknown>) {
      state.options = options;
      return map;
    },
    LngLatBounds: Bounds,
    Marker: function (options: { element: HTMLElement }) {
      state.marker(options);
      const marker = {
        setLngLat: () => marker,
        addTo: () => marker,
        remove: vi.fn(),
        getElement: () => options.element,
      };
      return marker;
    },
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
    expect.objectContaining({
      points: [
        [7, 49],
        [8, 54],
      ],
    }),
    expect.objectContaining({ maxZoom: 11, animate: false }),
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
  act(() => state.events.movestart());
  state.height = 640;
  act(() => state.resize());
  expect(state.mapResize).toHaveBeenCalledTimes(2);
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
  const pin = state.marker.mock.calls[0][0].element as HTMLElement;
  const firstContent = pin.firstElementChild as HTMLElement;
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
    expect(state.fly).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [7, 49], zoom: 14, duration: 1100 }),
    );
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
    expect(state.fly).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [8, 54], zoom: 14, duration: 1100 }),
    );
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
    state.camera.mockReturnValue({ center: [7.5, 51], zoom: 6 });
    view.rerender(<PlaceMapCanvas locations={points} />);
    expect(state.camera).toHaveBeenCalledWith(
      expect.objectContaining({
        points: [
          [7, 49],
          [8, 54],
        ],
      }),
      expect.objectContaining({ maxZoom: 11 }),
    );
    expect(state.fly).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [7.5, 51], zoom: 6, duration: 1100 }),
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
  expect(state.options).toEqual(
    expect.objectContaining({ center: [7.2, 49.1], zoom: 12 }),
  );
  act(() => state.resize());
  expect(state.jump).toHaveBeenLastCalledWith({
    center: [7.2, 49.1],
    zoom: 12,
  });
  expect(state.fit).not.toHaveBeenCalled();
  view.rerender(
    <PlaceMapCanvas
      locations={[point]}
      focus={{ latitude: 49, longitude: 7 }}
    />,
  );
  expect(state.jump).toHaveBeenLastCalledWith({ center: [7, 49], zoom: 14 });
  expect(state.fly).not.toHaveBeenCalled();
});

it('restores a saved camera after a fullscreen dialog first becomes measurable', () => {
  render(
    <PlaceMapCanvas
      initialViewport={{ latitude: 49.1, longitude: 7.2, zoom: 16 }}
    />,
  );
  expect(state.options).toEqual(
    expect.objectContaining({ center: [7.2, 49.1], zoom: 15 }),
  );
  state.width = 390;
  state.height = 740;
  act(() => state.resize());
  expect(state.jump).toHaveBeenLastCalledWith({
    center: [7.2, 49.1],
    zoom: 15,
  });
  const calls = state.jump.mock.calls.length;
  state.height = 640;
  act(() => state.resize());
  expect(state.jump).toHaveBeenCalledTimes(calls);
});

it("reports only the viewer's own gestures and settles after they rest", () => {
  vi.useFakeTimers();
  try {
    state.width = 390;
    state.height = 740;
    const onUserMotionChange = vi.fn();
    render(
      <PlaceMapCanvas
        onUserMotionChange={onUserMotionChange}
        locations={[
          { id: 'south', label: 'South', latitude: 49, longitude: 7, count: 1 },
        ]}
      />,
    );
    // Framing and place flights carry no original input event.
    act(() => state.events.movestart({}));
    act(() => state.events.moveend());
    act(() => vi.advanceTimersByTime(5000));
    expect(onUserMotionChange).not.toHaveBeenCalled();

    act(() =>
      state.events.movestart({ originalEvent: new Event('touchmove') }),
    );
    expect(onUserMotionChange).toHaveBeenLastCalledWith(true);
    act(() => state.events.moveend());
    act(() => vi.advanceTimersByTime(1000));
    expect(onUserMotionChange).toHaveBeenCalledTimes(1);
    // A new gesture within the rest period keeps the tools hidden.
    act(() =>
      state.events.movestart({ originalEvent: new Event('touchmove') }),
    );
    act(() => state.events.moveend());
    act(() => vi.advanceTimersByTime(1500));
    expect(onUserMotionChange).toHaveBeenCalledTimes(2);
    expect(onUserMotionChange).toHaveBeenLastCalledWith(false);
  } finally {
    vi.useRealTimers();
  }
});
