import type { WirReelStyleId } from '../api/generated/models/WirReelStyleId';
import { APP_ICON_CAPABILITY } from './appIcon';

/**
 * Wir reel styles (#2345): the personal presentation of the Wir reels of
 * new-for-you notices (`wirNotices`) and waiting games (`games.waiting`).
 * Circles are the default and Free; tiles and chips are Pro presentation
 * choices (`theme.bespoke_packs`). A saved
 * style stays in effect after Pro ends; only choosing another Pro style
 * needs Pro.
 */
export type WirReelStyle = `${WirReelStyleId}`;

/** Order of the styles in the settings sheet. */
export const WIR_REEL_STYLES: readonly WirReelStyle[] = [
  'circles',
  'tiles',
  'chips',
];

export const DEFAULT_WIR_REEL_STYLE: WirReelStyle = 'circles';

/** Choosing another style is part of the bespoke personalization pack. */
export const WIR_REEL_STYLE_CAPABILITY = APP_ICON_CAPABILITY;

export function isWirReelStyle(value: unknown): value is WirReelStyle {
  return (
    typeof value === 'string' &&
    (WIR_REEL_STYLES as readonly string[]).includes(value)
  );
}

export function isProWirReelStyle(style: WirReelStyle): boolean {
  return style !== DEFAULT_WIR_REEL_STYLE;
}

const PREFIX = 'eimir-wir-reel-style-v1:';
const MAX_AGE = 30 * 24 * 60 * 60_000;

/**
 * Presentation metadata only: the last style this device saw, so Wir paints
 * the reels in the chosen style first instead of switching after the read.
 * It never authorizes anything and is cleared on sign-out.
 */
export function wirReelStyleStorageKey(
  instance: string,
  accountId: string,
  spaceId: string,
): string {
  return (
    PREFIX + JSON.stringify([instance.replace(/\/+$/, ''), accountId, spaceId])
  );
}

export function readWirReelStyle(key: string): WirReelStyle | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 256) return undefined;
    const value = JSON.parse(raw);
    if (
      value.schema !== 1 ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > Date.now() ||
      Date.now() - value.savedAt >= MAX_AGE
    )
      return undefined;
    return isWirReelStyle(value.style) ? value.style : undefined;
  } catch {
    return undefined;
  }
}

export function rememberWirReelStyle(key: string, style: WirReelStyle): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ schema: 1, style, savedAt: Date.now() }),
    );
  } catch {
    /* The style still works when device storage is unavailable. */
  }
}

export function forgetWirReelStyle(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Nothing sensitive is stored. */
  }
}

export function clearWirReelStylePreferences(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* Presentation metadata cannot grant access. */
  }
}
