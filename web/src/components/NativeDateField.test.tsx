// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeDateField } from './NativeDateField';

afterEach(() => {
  cleanup();
});

describe('NativeDateField', () => {
  it('associates its label and passes native date constraints through', () => {
    render(
      <NativeDateField
        id="shared-date"
        name="sharedDate"
        label="Date"
        defaultValue="2026-09-19"
        required
        disabled
        min="2026-01-01"
        max="2026-12-31"
      />,
    );

    const input = screen.getByLabelText('Date') as HTMLInputElement;
    expect(input.id).toBe('shared-date');
    expect(input.name).toBe('sharedDate');
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-09-19');
    expect(input.required).toBe(true);
    expect(input.disabled).toBe(true);
    expect(input.min).toBe('2026-01-01');
    expect(input.max).toBe('2026-12-31');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('wires help and error text together with existing descriptions', () => {
    render(
      <NativeDateField
        id="shared-date"
        label="Date"
        aria-describedby="external-date-help"
        helpText="Choose the calendar day."
        error="Choose a valid date."
      />,
    );

    const input = screen.getByLabelText('Date');
    expect(input.getAttribute('aria-describedby')).toBe(
      'external-date-help shared-date-help shared-date-error',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Choose the calendar day.').id).toBe(
      'shared-date-help',
    );
    const error = screen.getByRole('alert');
    expect(error.id).toBe('shared-date-error');
    expect(error.textContent).toBe('Choose a valid date.');
  });

  it('forwards the ref to the native input', () => {
    const ref = createRef<HTMLInputElement>();

    render(<NativeDateField ref={ref} label="Date" />);

    const input = screen.getByLabelText('Date');
    expect(ref.current).toBe(input);
    expect(ref.current?.tagName).toBe('INPUT');
  });

  it('opens the native picker once when explicit picker opening is enabled', () => {
    const onClick = vi.fn();
    render(
      <NativeDateField label="Date" openPickerOnClick onClick={onClick} />,
    );

    const input = screen.getByLabelText('Date') as HTMLInputElement;
    const showPicker = vi.fn();
    Object.defineProperty(input, 'showPicker', {
      configurable: true,
      value: showPicker,
    });

    fireEvent.click(input);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('does not force the picker after a consumer cancels the click', () => {
    render(
      <NativeDateField
        label="Date"
        openPickerOnClick
        onClick={(event) => event.preventDefault()}
      />,
    );

    const input = screen.getByLabelText('Date') as HTMLInputElement;
    const showPicker = vi.fn();
    Object.defineProperty(input, 'showPicker', {
      configurable: true,
      value: showPicker,
    });

    fireEvent.click(input);

    expect(showPicker).not.toHaveBeenCalled();
  });
});
