// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { NativeSessionGate } from './NativeSessionGate';

afterEach(cleanup);

it('shows a branded first frame while native secure restoration is pending', async () => {
  let complete!: () => void;
  const restoration = new Promise<void>((resolve) => {
    complete = resolve;
  });
  render(
    <NativeSessionGate restoration={restoration} label="Wird geladen">
      <p>Authenticated content</p>
    </NativeSessionGate>,
  );
  expect(screen.getByRole('status').textContent).toContain('Wird geladen');
  expect(screen.queryByText('Authenticated content')).toBeNull();
  await act(async () => complete());
  expect(screen.getByText('Authenticated content')).toBeTruthy();
});

it('renders the ordinary Web tree without a restoration boundary', () => {
  render(
    <NativeSessionGate restoration={null} label="Wird geladen">
      <p>Public content</p>
    </NativeSessionGate>,
  );
  expect(screen.getByText('Public content')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
});
