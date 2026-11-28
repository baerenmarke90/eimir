import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR_COUNT,
  defaultAvatarIndex,
  defaultAvatarUrl,
  displayAvatarUrl,
} from './defaultAvatar';

const ACCOUNT_ID = '0192a8e4-7c1a-7b3e-9f4d-3a1c5e6f7a80';

describe('default avatar', () => {
  it('chooses the same picture for the same account every time', () => {
    expect(defaultAvatarUrl(ACCOUNT_ID)).toBe(defaultAvatarUrl(ACCOUNT_ID));
  });

  it('always stays inside the shipped set', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const index = defaultAvatarIndex(`account-${seed}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(DEFAULT_AVATAR_COUNT);
    }
  });

  it('spreads accounts over the whole set', () => {
    const used = new Set(
      Array.from({ length: 200 }, (_, seed) =>
        defaultAvatarIndex(`account-${seed}`),
      ),
    );
    expect(used.size).toBe(DEFAULT_AVATAR_COUNT);
  });

  it('points at a versioned static file', () => {
    expect(defaultAvatarUrl(ACCOUNT_ID)).toMatch(
      /^\/identity\/default-avatars\/v1\/avatar-[1-8]\.svg$/u,
    );
  });

  it('prefers the real picture', () => {
    expect(
      displayAvatarUrl(ACCOUNT_ID, {
        avatarUrl: 'blob:real',
        hasNoPicture: true,
      }),
    ).toBe('blob:real');
  });

  it('shows the stand-in only once the profile is known to have no picture', () => {
    expect(
      displayAvatarUrl(ACCOUNT_ID, { avatarUrl: null, hasNoPicture: true }),
    ).toBe(defaultAvatarUrl(ACCOUNT_ID));
  });

  it('stays empty while the picture is still loading or failed to load', () => {
    expect(
      displayAvatarUrl(ACCOUNT_ID, { avatarUrl: null, hasNoPicture: false }),
    ).toBeNull();
  });
});
