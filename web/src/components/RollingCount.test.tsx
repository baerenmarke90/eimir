// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RollingCount } from './RollingCount';

describe('RollingCount', () => {
  it('keeps the words and the readable number, with one strip per digit', () => {
    const { container } = render(
      <p>
        <RollingCount text="1.096 Tage zusammen" value="1.096" />
      </p>,
    );
    const line = container.querySelector('p');
    expect(line?.querySelector('.sr-only')?.textContent).toBe('1.096');
    expect(
      line
        ?.querySelector('.rolling-count-figures')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(line?.textContent).toContain('Tage zusammen');

    const digits = [
      ...container.querySelectorAll<HTMLElement>('.rolling-count-digit'),
    ];
    expect(digits).toHaveLength(4);
    expect(
      digits.map((digit) => digit.style.getPropertyValue('--rolling-digit')),
    ).toEqual(['1', '0', '9', '6']);
    // Ordered from the right, so the last digit starts first.
    expect(
      digits.map((digit) => digit.style.getPropertyValue('--rolling-order')),
    ).toEqual(['3', '2', '1', '0']);
    expect(digits[0].querySelectorAll('.rolling-count-strip > *')).toHaveLength(
      10,
    );
  });

  it('leaves the grouping separator still', () => {
    const { container } = render(
      <RollingCount text="1,000 days together" value="1,000" />,
    );
    const figures = container.querySelector('.rolling-count-figures');
    expect(figures?.children).toHaveLength(5);
    expect(figures?.children[1].className).toBe('');
    expect(figures?.children[1].textContent).toBe(',');
  });

  it('renders plain text without a count', () => {
    const { container } = render(
      <RollingCount text="Happy birthday, Alex" value="" />,
    );
    expect(container.textContent).toBe('Happy birthday, Alex');
    expect(container.querySelector('.rolling-count')).toBeNull();
  });

  it('renders plain text when the number is not in the copy', () => {
    const { container } = render(
      <RollingCount text="Your story begins today" value="1.000" />,
    );
    expect(container.querySelector('.rolling-count')).toBeNull();
  });
});
