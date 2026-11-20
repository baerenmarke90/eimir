// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest';
import { i18n } from '../i18n';
import { invalidateMotionTokens } from '../motion/tokens';
import PlaceMapCanvas, { type MapArea } from './PlaceMapCanvas';

const state = vi.hoisted(() => ({
  width: 0,
  height: 0,
  native: false,
  resize: () => {},
  events: {} as Record<string, (event?: unknown) => void>,
  once: {} as Record<string, Array<(event?: unknown) => void>>,
  storedStyle: null as unknown,
  setStyle: vi.fn(),
  options: {} as Record<string, unknown>,
  fit: vi.fn(),
  mapResize: vi.fn(),
  remove: vi.fn(),
  jump: vi.fn(),
  fly: vi.fn(),
  camera: vi.fn(),
  stop: vi.fn(),
  marker: vi.fn(),
  dragPan: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  controls: [] as Array<{ onAdd: (map: unknown) => HTMLElement }>,
  map: null as unknown,
}));
vi.mock('../pwa', () => ({ isCapacitorNative: () => state.native }));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({
  default: '/worker.js',
}));
vi.mock('../client/basemapStyleCache', () => ({
  cachedBasemapStyle: () => state.storedStyle,
  forgetBasemapStyle: vi.fn(),
  refreshBasemapStyle: vi.fn(() => Promise.resolve()),
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
    once: (event: string, callback: () => void) => {
      state.once[event] = [...(state.once[event] ?? []), callback];
      return map;
    },
    off: vi.fn(),
    setStyle: state.setStyle,
    addControl: (control: { onAdd: (map: unknown) => HTMLElement }) => {
      state.controls.push(control);
      return map;
    },
    zoomIn: state.zoomIn,
    zoomOut: state.zoomOut,
    dragPan: { enable: state.dragPan },
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
  state.map = map;
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
  state.native = false;
  state.events = {};
  state.once = {};
  state.storedStyle = null;
  state.controls = [];
  vi.clearAllMocks();
  invalidateMotionTokens();
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

it('uses the native HTTP cache only for public map tiles', () => {
  state.native = true;
  render(<PlaceMapCanvas />);
  const transform = state.options.transformRequest as (
    url: string,
    type: string,
  ) => unknown;
  const tile = 'https://tiles.openfreemap.org/planet/version/0/0/0.pbf';
  expect(transform(tile, 'Tile')).toEqual({ url: tile, cache: 'force-cache' });
  expect(
    transform('https://tiles.openfreemap.org/planet', 'Source'),
  ).toBeUndefined();
  expect(
    transform('https://tiles.openfreemap.org/styles/liberty', 'Style'),
  ).toBeUndefined();
  expect(
    transform('https://tiles.openfreemap.org.example/tile', 'Tile'),
  ).toBeUndefined();
  // The versioned sprite sheet and the font glyphs stay on the device (#2063).
  for (const [url, type] of [
    [
      'https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.json',
      'SpriteJSON',
    ],
    [
      'https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png',
      'SpriteImage',
    ],
    [
      'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Bold/0-255.pbf',
      'Glyphs',
    ],
  ])
    expect(transform(url, type)).toEqual({ url, cache: 'force-cache' });
});

it('frames arriving areas until the viewer moves and drops withdrawn areas', () => {
  state.width = 390;
  state.height = 740;
  const own: MapArea = {
    id: 'own',
    tone: 'own',
    latitude: 50,
    longitude: 7,
    radiusMeters: 1000,
  };
  const partner: MapArea = {
    ...own,
    id: 'partner',
    tone: 'partner',
    latitude: 53,
  };
  const view = render(<PlaceMapCanvas areas={[own]} />);
  expect(state.fit).toHaveBeenCalledTimes(1);
  view.rerender(<PlaceMapCanvas areas={[own, partner]} />);
  expect(state.fit).toHaveBeenCalledTimes(2);
  view.rerender(<PlaceMapCanvas areas={[own]} />);
  expect(state.fit).toHaveBeenCalledTimes(3);
  expect(state.fit.mock.lastCall?.[0].points).toHaveLength(2);
  act(() =>
    state.events.movestart({ originalEvent: new Event('pointerdown') }),
  );
  view.rerender(<PlaceMapCanvas areas={[own, partner]} />);
  expect(state.fit).toHaveBeenCalledTimes(3);
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

it('shows the map in one piece once its view has drawn and photos loaded', () => {
  const { container } = render(<PlaceMapCanvas revealWhenComplete />);
  const canvas = container.querySelector('.place-map-canvas');
  expect(canvas?.getAttribute('data-reveal')).toBe('waiting');
  act(() => {
    for (const callback of state.once.idle ?? []) callback();
  });
  return act(async () => {
    await Promise.resolve();
  }).then(() => {
    expect(canvas?.getAttribute('data-reveal')).toBe('complete');
  });
});

it('leaves other maps as they are', () => {
  const { container } = render(<PlaceMapCanvas />);
  expect(
    container.querySelector('.place-map-canvas')?.hasAttribute('data-reveal'),
  ).toBe(false);
});

it('starts from the basemap style kept on the device, localized', () => {
  state.storedStyle = {
    version: 8,
    sources: {
      openmaptiles: {
        type: 'vector',
        tiles: ['https://tiles.openfreemap.org/planet/v/{z}/{x}/{y}.pbf'],
        attribution: 'OpenFreeMap Data from OpenStreetMap',
      },
    },
    layers: [],
  };
  render(<PlaceMapCanvas />);
  const [style] = state.setStyle.mock.calls[0];
  expect(typeof style).toBe('object');
  expect(style.sources.openmaptiles.tiles).toHaveLength(1);
  expect(style.sources.openmaptiles.attribution).not.toContain('Data from');
});

it('loads the style from the provider when none is kept', () => {
  render(<PlaceMapCanvas />);
  expect(state.setStyle.mock.calls[0][0]).toBe(
    'https://tiles.openfreemap.org/styles/liberty',
  );
});

/** A preference that tests can switch at runtime. */
function stubMotionPreference(reduced: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: reduced,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return (next: boolean) => {
    query.matches = next;
    for (const listener of listeners) listener();
  };
}

/** Motion roles as the generated product roles define them. */
function stubMotionRoles(roles: Record<string, string>) {
  const computed = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = computed(element);
    return new Proxy(style, {
      get(target, key) {
        if (key === 'getPropertyValue')
          return (name: string) => roles[name] ?? target.getPropertyValue(name);
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
}

it('keeps pan inertia only without reduced motion and follows a change', () => {
  const setReduced = stubMotionPreference(false);
  render(<PlaceMapCanvas />);
  expect(state.dragPan).toHaveBeenLastCalledWith(undefined);
  act(() => setReduced(true));
  expect(state.dragPan).toHaveBeenLastCalledWith({ maxSpeed: 0 });
  act(() => setReduced(false));
  expect(state.dragPan).toHaveBeenLastCalledWith(undefined);
});

it('steps the zoom buttons with the transition role and jumps with reduced motion', () => {
  const setReduced = stubMotionPreference(false);
  stubMotionRoles({ '--duration-transition': '240ms' });
  render(<PlaceMapCanvas />);
  const group = state.controls[0].onAdd(state.map);
  const zoomIn = group.querySelector<HTMLButtonElement>('.place-map-zoom-in');
  const zoomOut = group.querySelector<HTMLButtonElement>('.place-map-zoom-out');
  zoomIn?.click();
  expect(state.zoomIn).toHaveBeenLastCalledWith({ duration: 240 });
  zoomOut?.click();
  expect(state.zoomOut).toHaveBeenLastCalledWith({ duration: 240 });
  act(() => setReduced(true));
  zoomIn?.click();
  expect(state.zoomIn).toHaveBeenLastCalledWith({ animate: false });
  zoomOut?.click();
  expect(state.zoomOut).toHaveBeenLastCalledWith({ animate: false });
});

it('returns to a kept map without moving its camera', () => {
  stubMotionPreference(false);
  stubMotionRoles({ '--duration-map-camera': '1100ms' });
  state.width = 390;
  state.height = 740;
  const points = [
    { id: 'south', label: 'South', latitude: 49, longitude: 7, count: 1 },
    { id: 'north', label: 'North', latitude: 54, longitude: 8, count: 1 },
  ];
  const view = render(<PlaceMapCanvas locations={points} />);
  // Opening frames the overview without a camera journey.
  expect(state.fit).toHaveBeenCalledTimes(1);
  expect(state.fit.mock.lastCall?.[1]).toEqual(
    expect.objectContaining({ animate: false }),
  );
  view.rerender(
    <PlaceMapCanvas
      locations={points}
      focus={{ latitude: 49, longitude: 7 }}
    />,
  );
  expect(state.fly).toHaveBeenCalledTimes(1);
  act(() => state.events.moveend());
  const jumps = state.jump.mock.calls.length;
  // The kept tab hides (no size), then shows again, also after a fold.
  state.width = state.height = 0;
  act(() => state.resize());
  state.width = 720;
  state.height = 740;
  act(() => state.resize());
  view.rerender(
    <PlaceMapCanvas
      locations={points}
      focus={{ latitude: 49, longitude: 7 }}
    />,
  );
  expect(state.fly).toHaveBeenCalledTimes(1);
  expect(state.fit).toHaveBeenCalledTimes(1);
  expect(state.jump).toHaveBeenCalledTimes(jumps);
  expect(state.mapResize).toHaveBeenCalled();
});

it('lets the finger stop a "show us" journey and snaps it with reduced motion', () => {
  const setReduced = stubMotionPreference(false);
  stubMotionRoles({ '--duration-map-camera': '1100ms' });
  state.width = 390;
  state.height = 740;
  const own: MapArea = {
    id: 'own',
    tone: 'own',
    latitude: 50,
    longitude: 7,
    radiusMeters: 1000,
  };
  const view = render(<PlaceMapCanvas areas={[own]} />);
  view.rerender(<PlaceMapCanvas areas={[own]} showAreasRequest={1} />);
  expect(state.fit).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ duration: 1100, essential: true }),
  );
  const stops = state.stop.mock.calls.length;
  const viewport = view.container.querySelector('.place-map-viewport');
  if (!viewport) throw new Error('Map viewport must exist');
  fireEvent.pointerDown(viewport);
  expect(state.stop).toHaveBeenCalledTimes(stops + 1);
  act(() => setReduced(true));
  view.rerender(<PlaceMapCanvas areas={[own]} showAreasRequest={2} />);
  expect(state.fit).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ animate: false }),
  );
});

it('recreates the map for a new locale where the viewer left the camera', async () => {
  const previous = i18n.language;
  onTestFinished(async () => {
    await i18n.changeLanguage(previous);
  });
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
  // The viewer pans; the camera then rests elsewhere.
  act(() =>
    state.events.movestart({ originalEvent: new Event('pointerdown') }),
  );
  act(() => state.events.moveend());
  await act(() => i18n.changeLanguage(previous === 'de' ? 'en' : 'de'));
  expect(state.remove).toHaveBeenCalledTimes(1);
  expect(state.options).toEqual(
    expect.objectContaining({ center: [7, 49], zoom: 14 }),
  );
  act(() => state.resize());
  expect(state.jump).toHaveBeenLastCalledWith({ center: [7, 49], zoom: 14 });
  expect(state.fit).toHaveBeenCalledTimes(1);
  expect(state.fly).not.toHaveBeenCalled();
});
