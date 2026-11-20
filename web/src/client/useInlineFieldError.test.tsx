// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useInlineFieldError } from './useInlineFieldError';

afterEach(cleanup);

function Field() {
  const { error, errorId, fieldProps } = useInlineFieldError({
    missing: 'missing',
    mismatch: 'mismatch',
  });
  return (
    <form>
      <input aria-label="mail" type="email" required {...fieldProps} />
      {error ? (
        <p id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit">send</button>
    </form>
  );
}

it('renders its own message instead of the native bubble and clears on input', () => {
  render(<Field />);
  const input = screen.getByLabelText('mail') as HTMLInputElement;
  // `fireEvent` reports `false` when a handler prevented the native bubble.
  expect(fireEvent.invalid(input)).toBe(false);
  expect(screen.getByRole('alert').textContent).toBe('missing');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toBe(
    screen.getByRole('alert').id,
  );

  fireEvent.input(input, { target: { value: 'abc' } });
  expect(screen.queryByRole('alert')).toBeNull();

  fireEvent.invalid(input);
  expect(screen.getByRole('alert').textContent).toBe('mismatch');
});
