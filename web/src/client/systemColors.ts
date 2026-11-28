/**
 * "System colours" (Android Material You), device-local and native-only.
 *
 * The Android shell reports the dynamic system palette. This module maps a few
 * of its tones onto the action and brand accent tokens only; surfaces and
 * backgrounds stay as the chosen design defines them. A mapping that cannot
 * keep readable contrast is rejected, and the design's own colours stay.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './config';

export type ToneName =
  | '0'
  | '10'
  | '50'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | '1000';
export type Tones = Record<ToneName, string>;

export interface SystemPalette {
  available: boolean;
  accent1?: Tones;
  accent2?: Tones;
  neutral1?: Tones;
  neutral2?: Tones;
}

export interface SystemAccentScheme {
  actionPrimary: string;
  onActionPrimary: string;
  brandStrong: string;
  brandText: string;
  focus: string;
}
export interface SystemAccent {
  light: SystemAccentScheme;
  dark: SystemAccentScheme;
}

interface SystemColorsPlugin {
  palette(): Promise<SystemPalette>;
}
const nativePlugin = registerPlugin<SystemColorsPlugin>('SystemColors');

/** Worst-case design surfaces the accents must stay readable on. */
const LIGHT_REFERENCE_SURFACE = '#f3eee8';
const DARK_REFERENCE_SURFACE = '#2a2f48';
const TEXT_CONTRAST = 4.5;
const COMPONENT_CONTRAST = 3;

const HEX = /^#[0-9a-f]{6}$/i;

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const REQUIRED_TONES: ToneName[] = [
  '0',
  '200',
  '300',
  '600',
  '700',
  '800',
  '1000',
];

function validTones(tones: Tones | undefined): tones is Tones {
  return !!tones && REQUIRED_TONES.every((tone) => HEX.test(tones[tone] ?? ''));
}

/** The candidate with the best contrast that still reaches the text minimum. */
function readableOn(background: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestRatio = TEXT_CONTRAST;
  for (const candidate of candidates) {
    const ratio = contrastRatio(background, candidate);
    if (ratio >= bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

function scheme(
  tones: Tones,
  surface: string,
  pick: { action: ToneName; brand: ToneName; focus: ToneName; on: ToneName },
): SystemAccentScheme | null {
  const actionPrimary = tones[pick.action];
  const brand = tones[pick.brand];
  const focus = tones[pick.focus];
  const onActionPrimary =
    readableOn(actionPrimary, [tones[pick.on]]) ??
    readableOn(actionPrimary, [tones['0'], tones['1000']]);
  if (
    !onActionPrimary ||
    contrastRatio(actionPrimary, surface) < COMPONENT_CONTRAST ||
    contrastRatio(focus, surface) < COMPONENT_CONTRAST ||
    contrastRatio(brand, surface) < TEXT_CONTRAST
  )
    return null;
  return {
    actionPrimary,
    onActionPrimary,
    brandStrong: brand,
    brandText: brand,
    focus,
  };
}

/**
 * Maps the primary system accent onto the action and brand accent tokens for
 * both schemes. Returns null when the palette is unavailable or either scheme
 * cannot keep readable contrast, so the design's own colours stay.
 */
export function deriveSystemAccent(
  palette: SystemPalette | null | undefined,
): SystemAccent | null {
  if (!palette?.available || !validTones(palette.accent1)) return null;
  const tones = palette.accent1;
  const light = scheme(tones, LIGHT_REFERENCE_SURFACE, {
    action: '600',
    brand: '700',
    focus: '600',
    on: '0',
  });
  const dark = scheme(tones, DARK_REFERENCE_SURFACE, {
    action: '200',
    brand: '200',
    focus: '300',
    on: '800',
  });
  return light && dark ? { light, dark } : null;
}

const VARIABLES: Record<keyof SystemAccentScheme, string> = {
  actionPrimary: 'action',
  onActionPrimary: 'on-action',
  brandStrong: 'brand-strong',
  brandText: 'brand-text',
  focus: 'focus',
};

/** The root custom properties `design/system-colors.css` maps onto tokens. */
export function systemColorProperties(
  accent: SystemAccent,
): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as const)
    for (const key of Object.keys(VARIABLES) as (keyof SystemAccentScheme)[])
      properties[`--system-colors-${mode}-${VARIABLES[key]}`] =
        accent[mode][key];
  return properties;
}

export const SYSTEM_COLORS_SETTING_KEY = 'eimir.systemColors';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Off by default; stored on this device only. */
export function systemColorsEnabled(): boolean {
  try {
    return storage()?.getItem(SYSTEM_COLORS_SETTING_KEY) === 'on';
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

export function setSystemColorsEnabled(enabled: boolean): void {
  try {
    storage()?.setItem(SYSTEM_COLORS_SETTING_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage can be unavailable (private mode); the default stays.
  }
  for (const listener of listeners) listener();
}

export function subscribeSystemColorsEnabled(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The native palette, or null outside the Android app or on older Android. */
export async function readSystemPalette(): Promise<SystemPalette | null> {
  if (!isAndroidApp() || !Capacitor.isPluginAvailable('SystemColors'))
    return null;
  try {
    return await nativePlugin.palette();
  } catch {
    return null;
  }
}

const ATTRIBUTE = 'data-system-colors';
let applied: string[] = [];

function clear(root: HTMLElement): void {
  root.removeAttribute(ATTRIBUTE);
  for (const name of applied) root.style.removeProperty(name);
  applied = [];
}

/** Applies or removes the system accent on the document root. */
export async function refreshSystemColors(
  root: HTMLElement = document.documentElement,
): Promise<void> {
  if (!systemColorsEnabled()) return clear(root);
  const accent = deriveSystemAccent(await readSystemPalette());
  // The choice may have changed while the palette was read.
  if (!systemColorsEnabled() || !accent) return clear(root);
  clear(root);
  const properties = systemColorProperties(accent);
  for (const [name, value] of Object.entries(properties))
    root.style.setProperty(name, value);
  applied = Object.keys(properties);
  root.setAttribute(ATTRIBUTE, '');
}

let stop: (() => void) | null = null;

/** Keeps the system accent current: on choice change and on foreground return. */
export function startSystemColors(
  root: HTMLElement = document.documentElement,
): void {
  if (stop || !isAndroidApp()) return;
  const refresh = () => void refreshSystemColors(root);
  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  const unsubscribe = subscribeSystemColorsEnabled(refresh);
  document.addEventListener('visibilitychange', refreshWhenVisible);
  refresh();
  stop = () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', refreshWhenVisible);
    clear(root);
    stop = null;
  };
}

export function stopSystemColorsForTests(): void {
  stop?.();
}
