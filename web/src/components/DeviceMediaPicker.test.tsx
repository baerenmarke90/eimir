// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCapacitorNativePlatform } from '../client/config';
import copy from '../i18n/locales/composer';
import { DeviceMediaPicker } from './DeviceMediaPicker';

vi.mock('../client/config', () => ({ isCapacitorNativePlatform: vi.fn() }));

function renderIntake() {
  render(
    <DeviceMediaPicker
      id="media"
      multiple
      disabled={false}
      intake
      onFiles={() => undefined}
    />,
  );
}

describe('DeviceMediaPicker intake hint', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(isCapacitorNativePlatform).mockReset();
  });

  it('offers drag and drop in the browser', () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    renderIntake();
    expect(screen.getByText(copy.chooseOrDrag)).toBeTruthy();
  });

  it('does not promise drag and drop in the native app', () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    renderIntake();
    expect(screen.getByText(copy.chooseFromDevice)).toBeTruthy();
    expect(screen.queryByText(copy.chooseOrDrag)).toBeNull();
  });
});
