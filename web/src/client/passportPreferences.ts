const PREFIX = 'eimir-passport-statistics-v1';

/** A device preference only: no content, grant or count belongs in this store. */
export function passportStatisticsKey(
  instance: string,
  accountId: string,
  spaceId: string,
): string {
  return JSON.stringify([
    PREFIX,
    instance.replace(/\/+$/, ''),
    accountId,
    spaceId,
  ]);
}

export function readPassportStatisticsPreference(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function savePassportStatisticsPreference(
  key: string,
  enabled: boolean,
): void {
  try {
    window.localStorage.setItem(key, String(enabled));
  } catch {
    /* The current view still honors the user's choice without persistent storage. */
  }
}
