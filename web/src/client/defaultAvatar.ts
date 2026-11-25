/**
 * Neutral stand-in pictures for Accounts that have not set a profile picture.
 *
 * They are static display assets, so nothing is stored per Account and a real
 * profile picture always wins. The image is chosen from the Account id, which
 * keeps a person recognisable across devices and sessions without any server
 * state. Files live in `public/identity/default-avatars/v1/`; a changed image
 * needs a new versioned folder because the files are cached.
 */
export const DEFAULT_AVATAR_COUNT = 8;
const DEFAULT_AVATAR_BASE_PATH = '/identity/default-avatars/v1';

/** FNV-1a over the id's UTF-16 code units: stable and platform independent. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function defaultAvatarIndex(accountId: string): number {
  return stableHash(accountId) % DEFAULT_AVATAR_COUNT;
}

export function defaultAvatarUrl(accountId: string): string {
  return `${DEFAULT_AVATAR_BASE_PATH}/avatar-${defaultAvatarIndex(accountId) + 1}.svg`;
}

/**
 * The picture a screen should show for an Account: the real one when it
 * exists, the neutral stand-in only once the profile is known to have none.
 * While the profile still loads (or a picture fails to load) this stays
 * `null`, so callers keep their initials and a real photo never flashes a
 * stand-in first.
 */
export function displayAvatarUrl(
  accountId: string,
  avatar: { avatarUrl: string | null; hasNoPicture: boolean },
): string | null {
  if (avatar.avatarUrl) return avatar.avatarUrl;
  return avatar.hasNoPicture ? defaultAvatarUrl(accountId) : null;
}
