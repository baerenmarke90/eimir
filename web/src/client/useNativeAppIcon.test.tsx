// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppIconId } from '../api/generated/models/AppIconId';
import { useNativeAppIcon } from './useNativeAppIcon';
import {
  applyNativeAppIcon,
  canApplyNativeAppIcon,
  isAndroidApp,
} from './nativeAppIcon';

vi.mock('./nativeAppIcon', () => ({
  applyNativeAppIcon: vi.fn(),
  canApplyNativeAppIcon: vi.fn(),
  isAndroidApp: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(isAndroidApp).mockReturnValue(true);
  vi.mocked(canApplyNativeAppIcon).mockReturnValue(true);
  vi.mocked(applyNativeAppIcon).mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('waits for an authorized preference and keeps the installed icon on teardown', async () => {
  const { result, rerender, unmount } = renderHook(
    ({ iconId }: { iconId: AppIconId | undefined }) => useNativeAppIcon(iconId),
    { initialProps: { iconId: undefined as AppIconId | undefined } },
  );
  expect(applyNativeAppIcon).not.toHaveBeenCalled();
  rerender({ iconId: 'sage' });
  await waitFor(() => expect(result.current.status).toBe('applied'));
  expect(applyNativeAppIcon).toHaveBeenCalledExactlyOnceWith('sage');
  unmount();
  expect(applyNativeAppIcon).toHaveBeenCalledTimes(1);
});

it('retains a native failure and retries locally without another preference write', async () => {
  vi.mocked(applyNativeAppIcon).mockRejectedValueOnce(new Error('unavailable'));
  const { result } = renderHook(() => useNativeAppIcon('sand'));
  await waitFor(() => expect(result.current.status).toBe('error'));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe('applied'));
  expect(applyNativeAppIcon).toHaveBeenNthCalledWith(2, 'sand');
});

it('ignores old completion when a newer authorized preference has arrived', async () => {
  let complete!: () => void;
  vi.mocked(applyNativeAppIcon).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ iconId }: { iconId: AppIconId }) => useNativeAppIcon(iconId),
    { initialProps: { iconId: 'sage' as AppIconId } },
  );
  rerender({ iconId: 'original' });
  await waitFor(() => expect(result.current.status).toBe('applied'));
  await act(async () => complete());
  expect(result.current.status).toBe('applied');
  expect(applyNativeAppIcon).toHaveBeenNthCalledWith(2, 'original');
});

it('requires an APK update when the native plugin is missing and leaves Web untouched', () => {
  vi.mocked(canApplyNativeAppIcon).mockReturnValue(false);
  const native = renderHook(() => useNativeAppIcon('sage'));
  expect(native.result.current.status).toBe('update-required');
  native.unmount();
  vi.mocked(isAndroidApp).mockReturnValue(false);
  const browser = renderHook(() => useNativeAppIcon('sage'));
  expect(browser.result.current.status).toBe('browser');
  expect(applyNativeAppIcon).not.toHaveBeenCalled();
});
