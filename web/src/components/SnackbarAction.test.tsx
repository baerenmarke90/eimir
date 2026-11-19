// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '../i18n';
import { postSnackbar } from '../client/snackbar';
import wirCheckIn from '../i18n/locales/wirCheckIn';
import { Snackbar } from './Snackbar';

afterEach(cleanup);

it('offers one reversible action instead of dismiss and runs it once', () => {
  const undo = vi.fn();
  render(<Snackbar />);
  act(() =>
    postSnackbar('wirCheckIn.noteDeleted', undefined, {
      labelKey: 'wirCheckIn.undo',
      run: undo,
    }),
  );

  expect(screen.getByRole('status').textContent).toContain(
    wirCheckIn.noteDeleted,
  );
  expect(screen.queryByRole('button', { name: /×/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: wirCheckIn.undo }));
  expect(undo).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('status')).toBeNull();
});
