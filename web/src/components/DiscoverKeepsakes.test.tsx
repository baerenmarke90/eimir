// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KeepsakeStampMark } from './DiscoverKeepsakes';

afterEach(() => {
  cleanup();
});

describe('KeepsakeStampMark', () => {
  it('is decorative and presses only on request', () => {
    const { container, rerender } = render(<KeepsakeStampMark />);
    const mark = container.querySelector('svg');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.getAttribute('class')).toBe('momente-keepsake-stamp-mark');
    expect(mark?.hasAttribute('data-pressed')).toBe(false);
    expect(
      container.querySelectorAll(
        '.momente-keepsake-stamp-outer, .momente-keepsake-stamp-inner, .momente-keepsake-stamp-star',
      ),
    ).toHaveLength(3);

    rerender(<KeepsakeStampMark className="extra" pressed />);
    const pressed = container.querySelector('svg');
    expect(pressed?.getAttribute('class')).toBe(
      'momente-keepsake-stamp-mark extra',
    );
    expect(pressed?.getAttribute('data-pressed')).toBe('true');
  });
});
