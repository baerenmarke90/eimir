import {
  readSensitiveEntryToken,
  stripSensitiveEntryToken,
} from './entryToken';

describe('sensitive identity entry tokens', () => {
  it('reads the recovery token from the authoritative recovery path', () => {
    expect(
      readSensitiveEntryToken('/auth/recovery', '?token=recovery-token'),
    ).toEqual({
      kind: 'recovery',
      token: 'recovery-token',
    });
  });

  it('distinguishes magic-link, verification, invitation and signup entry paths', () => {
    expect(readSensitiveEntryToken('/auth/magic-link', '?token=magic')).toEqual(
      {
        kind: 'magicLink',
        token: 'magic',
      },
    );
    expect(
      readSensitiveEntryToken('/auth/verify-email', '?token=verify'),
    ).toEqual({
      kind: 'emailVerification',
      token: 'verify',
    });
    expect(
      readSensitiveEntryToken('/auth/invitation', '?token=invite'),
    ).toEqual({
      kind: 'invitation',
      token: 'invite',
    });
    expect(
      readSensitiveEntryToken('/auth/signup', '?token=signup-proof'),
    ).toEqual({
      kind: 'signup',
      token: 'signup-proof',
    });
  });

  it('does not treat a token on an unrelated path as an authentication proof', () => {
    expect(readSensitiveEntryToken('/story', '?token=secret')).toBeNull();
  });

  it('ignores empty tokens', () => {
    expect(
      readSensitiveEntryToken('/auth/recovery', '?token=%20%20'),
    ).toBeNull();
  });

  it('removes the proof while preserving unrelated query state', () => {
    expect(stripSensitiveEntryToken('?token=secret&from=email')).toBe(
      '/?from=email',
    );
  });
});
