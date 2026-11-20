// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import {
  configureHapticsForTests,
  HAPTICS_SETTING_KEY,
  setHapticsEnabled,
} from '../motion/haptics';
import { HapticsSettings } from './HapticsSettings';

afterEach(() => {
  cleanup();
  configureHapticsForTests({});
  setHapticsEnabled(true);
  localStorage.clear();
});

describe('HapticsSettings', () => {
  it('is not shown on the Web, whatever the viewport', () => {
    configureHapticsForTests({ native: false });
    render(<HapticsSettings />);
    expect(screen.queryByTestId('haptics-settings')).toBeNull();
  });

  it('is an accessible switch in the native app, on by default and device-local', () => {
    configureHapticsForTests({ native: true });
    render(<HapticsSettings />);
    const control = screen.getByRole('switch', {
      name: i18n.t('hapticsSettings.label'),
    });
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(control.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(control);
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(localStorage.getItem(HAPTICS_SETTING_KEY)).toBe('off');
    fireEvent.click(control);
    expect(localStorage.getItem(HAPTICS_SETTING_KEY)).toBe('on');
  });
});
