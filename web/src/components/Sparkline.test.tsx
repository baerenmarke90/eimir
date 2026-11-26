// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sparkline, sparklinePath } from './Sparkline';

describe('Sparkline', () => {
  afterEach(() => cleanup());

  it('breaks the line where a value is missing', () => {
    const path = sparklinePath([1, 2, null, 3], 30, 10);
    expect(path.match(/M/g)).toHaveLength(2);
  });

  it('draws nothing with fewer than two values', () => {
    expect(sparklinePath([5], 30, 10)).toBe('');
    expect(sparklinePath([null, null], 30, 10)).toBe('');
  });

  it('is an image with an accessible name', () => {
    render(<Sparkline values={[1, 3, 2]} label="Errors over 30 days" />);
    expect(
      screen.getByRole('img', { name: 'Errors over 30 days' }),
    ).toBeTruthy();
  });
});
