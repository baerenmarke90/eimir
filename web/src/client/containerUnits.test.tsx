// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outerFirst, useContainerUnits } from './containerUnits';

function Units() {
  const rootRef = useRef<HTMLDivElement>(null);
  useContainerUnits(rootRef, '.unit');
  return (
    <div ref={rootRef} className="unit" data-testid="outer" data-width="400">
      <div className="unit" data-testid="inner" data-width="200" />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useContainerUnits', () => {
  it('writes each element its own unit and the unit of the element around it', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const width = Number(this.dataset.width ?? 0);
        return { width, height: 0, top: 0, left: 0 } as DOMRect;
      },
    );
    const { getByTestId } = render(<Units />);
    const outer = getByTestId('outer');
    const inner = getByTestId('inner');
    expect(outer.style.getPropertyValue('--cu')).toBe('4.000px');
    expect(inner.style.getPropertyValue('--cu')).toBe('2.000px');
    // 1cqi for the inner element's own properties meant 1% of the outer one.
    expect(inner.style.getPropertyValue('--cu-outer')).toBe('4.000px');
  });
});

describe('outerFirst', () => {
  it('orders elements so containers come before their contents', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.append(inner);
    expect(outerFirst([inner, outer])).toEqual([outer, inner]);
  });
});
