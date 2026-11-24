/* Generated from design/designs/*.json by scripts/generate-app-designs.mjs. Do not edit. */

export type AppDesignLayout =
  | 'connected'
  | 'classic'
  | 'open'
  | 'compact'
  | 'rows'
  | 'names'
  | 'rooms'
  | 'chapters';

export type AppDesignTier = 'free' | 'pro';

export const DEFAULT_APP_DESIGN = 'connected';

export const APP_DESIGNS: Readonly<
  Record<
    string,
    { readonly tier: AppDesignTier; readonly layout: AppDesignLayout }
  >
> = {
  classic: { tier: 'pro', layout: 'classic' },
  connected: { tier: 'free', layout: 'connected' },
  home_rooms: { tier: 'pro', layout: 'rooms' },
  modern: { tier: 'pro', layout: 'compact' },
  quiet_together: { tier: 'pro', layout: 'names' },
  shared_album: { tier: 'pro', layout: 'rows' },
  shared_rhythm: { tier: 'pro', layout: 'chapters' },
  warm: { tier: 'free', layout: 'open' },
};
