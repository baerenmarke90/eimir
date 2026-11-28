// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemColorsOverrideNote } from '../components/SystemColorsOverrideNote';
import { SystemColorsSettings } from '../components/SystemColorsSettings';
import { i18n } from '../i18n';
import {
  contrastRatio,
  deriveSystemAccent,
  refreshSystemColors,
  SYSTEM_COLORS_SETTING_KEY,
  type SystemPalette,
  setSystemColorsEnabled,
  stopSystemColorsForTests,
  type Tones,
} from './systemColors';

const native = vi.hoisted(() => ({
  palette: vi.fn(),
  pluginAvailable: true,
  android: true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => native.pluginAvailable },
  registerPlugin: () => ({ palette: native.palette }),
}));
vi.mock('./config', () => ({ isAndroidApp: () => native.android }));

/** A blue Material tonal ramp, as Android 12+ reports it. */
const BLUE: Tones = {
  '0': '#ffffff',
  '10': '#001945',
  '50': '#f2f3ff',
  '100': '#dbe1ff',
  '200': '#b4c5ff',
  '300': '#8aa8ff',
  '400': '#5f8bff',
  '500': '#3d6fe6',
  '600': '#2f58c4',
  '700': '#2243a0',
  '800': '#142e7c',
  '900': '#0a1d5a',
  '1000': '#000000',
};
const palette = (accent1: Tones = BLUE): SystemPalette => ({
  available: true,
  accent1,
});
const PALE_LIGHT_ACTION = palette({ ...BLUE, '600': '#cfd8ff' });

beforeEach(() => {
  native.pluginAvailable = true;
  native.android = true;
  native.palette.mockResolvedValue(palette());
});
afterEach(() => {
  cleanup();
  stopSystemColorsForTests();
  localStorage.clear();
  native.palette.mockReset();
  document.documentElement.removeAttribute('data-system-colors');
  document.documentElement.removeAttribute('style');
});

describe('deriveSystemAccent', () => {
  it('maps tones onto the action and brand accents per scheme', () => {
    const accent = deriveSystemAccent(palette());
    expect(accent?.light).toMatchObject({
      actionPrimary: BLUE['600'],
      onActionPrimary: BLUE['0'],
      brandStrong: BLUE['700'],
      focus: BLUE['600'],
    });
    expect(accent?.dark).toMatchObject({
      actionPrimary: BLUE['200'],
      onActionPrimary: BLUE['800'],
      brandText: BLUE['200'],
      focus: BLUE['300'],
    });
  });

  it('also maps the softer brand tone used by ticks and marks', () => {
    const accent = deriveSystemAccent(palette());
    expect(accent?.light.brand).toBe(BLUE['500']);
    expect(accent?.dark.brand).toBe(BLUE['300']);
    expect(
      deriveSystemAccent(palette({ ...BLUE, '500': '#e6ebff' })),
    ).toBeNull();
  });

  it('keeps readable contrast for every derived pair', () => {
    const accent = deriveSystemAccent(palette());
    for (const scheme of [accent?.light, accent?.dark]) {
      expect(
        contrastRatio(
          scheme?.actionPrimary ?? '',
          scheme?.onActionPrimary ?? '',
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('derives another on-colour when the preferred one is unreadable', () => {
    const accent = deriveSystemAccent(palette({ ...BLUE, '800': '#b8c8ff' }));
    expect(accent?.dark.onActionPrimary).toBe('#000000');
  });

  it('falls back to the design colours when contrast is insufficient', () => {
    expect(deriveSystemAccent(PALE_LIGHT_ACTION)).toBeNull();
    expect(
      deriveSystemAccent(palette({ ...BLUE, '700': '#e0e6ff' })),
    ).toBeNull();
    expect(
      deriveSystemAccent(palette({ ...BLUE, '200': '#303a63' })),
    ).toBeNull();
  });

  it('is unavailable without a usable palette', () => {
    expect(deriveSystemAccent(null)).toBeNull();
    expect(deriveSystemAccent({ available: false })).toBeNull();
    expect(deriveSystemAccent(palette({ ...BLUE, '600': 'blue' }))).toBeNull();
  });
});

describe('person colours and tints', () => {
  const GREEN: Tones = {
    ...BLUE,
    '100': '#d9f2dc',
    '300': '#7fd08a',
    '500': '#2e8b45',
    '900': '#0d3a1b',
  };

  it('uses the tertiary accent for the partner and falls back to the secondary', () => {
    const withTertiary = deriveSystemAccent({
      ...palette(),
      accent3: GREEN,
      accent2: BLUE,
    });
    expect(withTertiary?.light.ownAccent).toBe(BLUE['500']);
    expect(withTertiary?.light.partnerAccent).toBe(GREEN['500']);
    expect(withTertiary?.dark.partnerAccent).toBe(GREEN['300']);
    expect(withTertiary?.dark.partnerSurface).toBe(GREEN['900']);
    const withSecondary = deriveSystemAccent({ ...palette(), accent2: GREEN });
    expect(withSecondary?.light.partnerAccent).toBe(GREEN['500']);
    expect(deriveSystemAccent(palette())?.light.partnerAccent).toBe(
      BLUE['500'],
    );
  });

  it('derives the tints from the primary accent', () => {
    const accent = deriveSystemAccent(palette());
    expect(accent?.light.tint).toBe(BLUE['100']);
    expect(accent?.dark.tint).toBe(BLUE['900']);
  });

  it('rejects a partner tone that lacks contrast', () => {
    expect(
      deriveSystemAccent({
        ...palette(),
        accent3: { ...GREEN, '500': '#e0f5e3' },
      }),
    ).toBeNull();
  });
});

describe('SystemColorsOverrideNote', () => {
  it('shows only while the system colours are applied', async () => {
    render(<SystemColorsOverrideNote />);
    expect(screen.queryByRole('note')).toBeNull();
    localStorage.setItem(SYSTEM_COLORS_SETTING_KEY, 'on');
    await act(() => refreshSystemColors(document.documentElement));
    expect(screen.getByRole('note').textContent).toBe(
      i18n.t('systemColors.overrides'),
    );
    act(() => setSystemColorsEnabled(false));
    await act(() => refreshSystemColors(document.documentElement));
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('refreshSystemColors', () => {
  const root = () => document.documentElement;
  const lightAction = () =>
    root().style.getPropertyValue('--system-colors-light-action');

  it('does nothing while the choice is off, which is the default', async () => {
    await refreshSystemColors(root());
    expect(root().hasAttribute('data-system-colors')).toBe(false);
    expect(native.palette).not.toHaveBeenCalled();
  });

  it('applies the palette when chosen and removes it again', async () => {
    localStorage.setItem(SYSTEM_COLORS_SETTING_KEY, 'on');
    await refreshSystemColors(root());
    expect(root().hasAttribute('data-system-colors')).toBe(true);
    expect(lightAction()).toBe(BLUE['600']);
    expect(root().style.getPropertyValue('--system-colors-dark-action')).toBe(
      BLUE['200'],
    );
    localStorage.setItem(SYSTEM_COLORS_SETTING_KEY, 'off');
    await refreshSystemColors(root());
    expect(root().hasAttribute('data-system-colors')).toBe(false);
    expect(lightAction()).toBe('');
  });

  it('picks up a changed palette on the next refresh', async () => {
    localStorage.setItem(SYSTEM_COLORS_SETTING_KEY, 'on');
    await refreshSystemColors(root());
    native.palette.mockResolvedValue(palette({ ...BLUE, '600': '#9a2f2f' }));
    await refreshSystemColors(root());
    expect(lightAction()).toBe('#9a2f2f');
  });

  it('keeps the design colours when the palette is unsuitable or missing', async () => {
    localStorage.setItem(SYSTEM_COLORS_SETTING_KEY, 'on');
    native.palette.mockResolvedValue(PALE_LIGHT_ACTION);
    await refreshSystemColors(root());
    expect(root().hasAttribute('data-system-colors')).toBe(false);
    native.pluginAvailable = false;
    await refreshSystemColors(root());
    expect(root().hasAttribute('data-system-colors')).toBe(false);
  });
});

describe('SystemColorsSettings', () => {
  const flush = () => act(async () => void (await Promise.resolve()));
  const label = () => i18n.t('systemColors.label');

  it('is not shown on the Web or on older Android', async () => {
    native.android = false;
    render(<SystemColorsSettings />);
    await flush();
    expect(screen.queryByTestId('system-colors-settings')).toBeNull();
    cleanup();
    native.android = true;
    native.palette.mockResolvedValue({ available: false });
    render(<SystemColorsSettings />);
    await flush();
    expect(screen.queryByTestId('system-colors-settings')).toBeNull();
  });

  it('is an accessible, device-local switch that is off by default', async () => {
    render(<SystemColorsSettings />);
    await flush();
    const control = screen.getByRole('switch', { name: label() });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(SYSTEM_COLORS_SETTING_KEY)).toBe('on');
    act(() => setSystemColorsEnabled(false));
    expect(control.getAttribute('aria-checked')).toBe('false');
  });

  it('disables the switch when the system palette lacks contrast', async () => {
    native.palette.mockResolvedValue(PALE_LIGHT_ACTION);
    render(<SystemColorsSettings />);
    await flush();
    const control = screen.getByRole('switch', { name: label() });
    expect((control as HTMLButtonElement).disabled).toBe(true);
  });
});
