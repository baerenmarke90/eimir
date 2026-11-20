// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { scenePlays, useScene } from './scene';

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;
let observed: Callback | null = null;

class FakeObserver {
  constructor(callback: Callback) {
    observed = callback;
  }
  observe() {}
  disconnect() {}
}

let reduce = false;
function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reduce,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

beforeEach(() => {
  observed = null;
  reduce = false;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  stubMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Scene({ active }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const scene = useScene(ref, { active });
  return <div ref={ref} data-testid="scene" {...scene.props} />;
}

function state(container: HTMLElement) {
  return container
    .querySelector('[data-testid="scene"]')
    ?.getAttribute('data-motion-scene');
}

it('plays only while seen and in use, and holds otherwise', () => {
  const { container, rerender } = render(<Scene />);
  expect(state(container)).toBe('playing');
  act(() => observed?.([{ isIntersecting: false }]));
  expect(state(container)).toBe('paused');
  act(() => observed?.([{ isIntersecting: true }]));
  expect(state(container)).toBe('playing');
  rerender(<Scene active={false} />);
  expect(state(container)).toBe('paused');
});

it('pauses while the page is hidden', () => {
  const { container } = render(<Scene />);
  const hidden = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden');
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(state(container)).toBe('paused');
  hidden.mockReturnValue('visible');
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(state(container)).toBe('playing');
  hidden.mockRestore();
});

it('pauses inside a hidden kept view', async () => {
  const panel = document.createElement('div');
  panel.setAttribute('data-primary-tab', 'momente');
  document.body.append(panel);
  const { container } = render(<Scene />, { container: panel });
  expect(state(container)).toBe('playing');
  await act(async () => {
    panel.setAttribute('hidden', '');
  });
  expect(state(container)).toBe('paused');
  panel.remove();
});

it('is absent with reduced motion', () => {
  reduce = true;
  stubMatchMedia();
  const { container } = render(<Scene />);
  expect(state(container)).toBe('paused');
  expect(scenePlays({ visible: true, active: true, reduced: true })).toBe(
    false,
  );
  expect(scenePlays({ visible: true, active: true, reduced: false })).toBe(
    true,
  );
});
