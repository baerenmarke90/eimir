// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FakeMediaQuery,
  installReducedMotion,
} from '../../motion/__fixtures__/fakeAnimation';
import type { VisibilityState } from '../../motion/visibility';
import { PRO_SCENE_IDS, ProScene } from './ProScene';

const visibility = vi.hoisted(() => ({
  listener: null as ((state: VisibilityState) => void) | null,
}));

vi.mock('../../motion/visibility', () => ({
  observeVisibility: (
    _element: Element,
    listener: (state: VisibilityState) => void,
  ) => {
    visibility.listener = listener;
    listener(state(true));
    return () => {
      visibility.listener = null;
    };
  },
}));

function state(visible: boolean): VisibilityState {
  return { page: true, keptView: true, onScreen: visible, visible };
}

let motion: FakeMediaQuery;

beforeEach(() => {
  motion = installReducedMotion(false);
});

afterEach(() => {
  motion.restore();
});

function scene(container: HTMLElement) {
  return container.querySelector('.pro-scene') as HTMLElement;
}

function playing(container: HTMLElement) {
  return scene(container).dataset.ambient === 'on';
}

describe('ProScene', () => {
  it('plays only when active and visible', () => {
    const { container, rerender } = render(
      <ProScene id="mapCloseness" active />,
    );
    expect(playing(container)).toBe(true);
    act(() => visibility.listener?.(state(false)));
    expect(playing(container)).toBe(false);
    act(() => visibility.listener?.(state(true)));
    expect(playing(container)).toBe(true);
    rerender(<ProScene id="mapCloseness" active={false} />);
    expect(playing(container)).toBe(false);
  });

  it('never plays under reduced motion', () => {
    motion.set(true);
    const { container } = render(<ProScene id="recapFilms" active />);
    expect(playing(container)).toBe(false);
    expect(scene(container).hasAttribute('data-started')).toBe(false);
  });

  it('keeps its still frame until it first plays', () => {
    const { container, rerender } = render(
      <ProScene id="memoryWorlds" active={false} />,
    );
    expect(scene(container).hasAttribute('data-started')).toBe(false);
    rerender(<ProScene id="memoryWorlds" active />);
    expect(scene(container).hasAttribute('data-started')).toBe(true);
    // Paused in place afterwards, not reset to the still frame (M4).
    rerender(<ProScene id="memoryWorlds" active={false} />);
    expect(playing(container)).toBe(false);
    expect(scene(container).hasAttribute('data-started')).toBe(true);
  });

  it('stops when reduced motion turns on', () => {
    const { container } = render(<ProScene id="gamesGarden" active />);
    expect(playing(container)).toBe(true);
    act(() => motion.set(true));
    expect(playing(container)).toBe(false);
    expect(scene(container).hasAttribute('data-started')).toBe(false);
  });

  it('shows its still frame again after reduced motion was on', () => {
    const { container, rerender } = render(
      <ProScene id="mapCloseness" active />,
    );
    expect(scene(container).hasAttribute('data-started')).toBe(true);
    act(() => motion.set(true));
    rerender(<ProScene id="mapCloseness" active={false} />);
    act(() => motion.set(false));
    expect(playing(container)).toBe(false);
    expect(scene(container).hasAttribute('data-started')).toBe(false);
  });

  it.each(PRO_SCENE_IDS)('draws the %s scene as decoration', (id) => {
    const { container } = render(<ProScene id={id} active={false} />);
    const root = scene(container);
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.dataset.scene).toBe(id);
    expect(root.querySelector('svg')).toBeTruthy();
    expect(
      root.querySelectorAll(
        'a, button, input, [tabindex]:not([tabindex="-1"])',
      ),
    ).toHaveLength(0);
  });

  it('gives every scene its own clip path ids', () => {
    const { container } = render(
      <>
        <ProScene id="mapCloseness" active={false} />
        <ProScene id="mapCloseness" active={false} />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shrinks a scene word that is wider than its field and keeps one that fits', () => {
    // jsdom has no text layout: ten drawing units per character.
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value(this: SVGTextElement) {
        return (this.textContent?.length ?? 0) * 10;
      },
    });
    try {
      const { container } = render(<ProScene id="mapCloseness" active />);
      const sizes = new Map(
        [...container.querySelectorAll('text')].map((node) => [
          node.textContent,
          Number(node.getAttribute('font-size')),
        ]),
      );
      // "412 km" (6 characters, 60 units) is wider than its 46 unit field.
      expect(sizes.get('412 km')).toBeCloseTo((10.5 * 46) / 60);
      // The once-message word is shrunk until it fits its pill as well.
      const message = [...container.querySelectorAll('text')].find(
        (node) => (node.textContent?.length ?? 0) > 6,
      );
      expect(Number(message?.getAttribute('font-size'))).toBeLessThan(8.5);
    } finally {
      Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
    }
  });
});
