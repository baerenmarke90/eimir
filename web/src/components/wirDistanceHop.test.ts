// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animateFlight, openFlightLayer } from '../motion/flight';
import { playDistanceHop } from './wirDistanceHop';

vi.mock('../motion/flight', async (original) => ({
  ...(await original<typeof import('../motion/flight')>()),
  animateFlight: vi.fn(() => null),
  openFlightLayer: vi.fn(),
}));

function stage() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="today-hero">
      <span class="partner-avatar"></span>
      <span class="partner-avatar"></span>
    </div>
    <span class="wir-bridge-line"><svg></svg></span>`;
  document.body.append(root);
  return root;
}

beforeEach(() => {
  vi.mocked(animateFlight).mockClear();
  vi.mocked(openFlightLayer).mockReturnValue({
    layer: document.createElement('div'),
    roles: {
      context: 280,
      flight: 560,
      moment: 900,
      stagger: 60,
      enter: 'linear',
      standard: 'linear',
    },
    dispose: vi.fn(),
  });
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('the light hop', () => {
  it('never shows a light back at its start on the portrait', () => {
    expect(playDistanceHop(stage(), 0.5)).not.toBeNull();
    const calls = vi.mocked(animateFlight).mock.calls;
    expect(calls).toHaveLength(6);
    for (const [, keyframes, options] of calls) {
      const frames = keyframes as Keyframe[];
      // Holds its end state while the lights behind it are still flying.
      expect(options.fill).toBe('both');
      expect(frames[0].opacity).toBe(0);
      expect(frames.at(-1)?.opacity).toBe(0);
    }
  });

  it('shows the lead light fully and its trail quietly', () => {
    playDistanceHop(stage(), 0);
    const peaks = vi
      .mocked(animateFlight)
      .mock.calls.map(([, keyframes]) =>
        Math.max(...(keyframes as Keyframe[]).map((f) => Number(f.opacity))),
      );
    expect(peaks).toEqual([1, 0.4, 0.4, 1, 0.4, 0.4]);
  });
});
