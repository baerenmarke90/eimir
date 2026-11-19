import { isCapacitorNativePlatform } from './config';
import { wishDetailPath } from './routes';

/**
 * The shareable address of a Wish. It carries only the opaque Wish id: no
 * title, text or other content, so a chat preview stays neutral and the
 * server still decides who may open it.
 */
export function wishShareUrl(origin: string, wishId: string): string {
  return `${origin.trim().replace(/\/+$/, '')}${wishDetailPath(wishId)}`;
}

/** The native app shares its instance address; a browser shares its own. */
export function wishShareOrigin(apiBaseUrl: string): string {
  return isCapacitorNativePlatform()
    ? apiBaseUrl
    : typeof window === 'undefined'
      ? apiBaseUrl
      : window.location.origin;
}
