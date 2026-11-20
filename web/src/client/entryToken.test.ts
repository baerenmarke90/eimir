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

  it('reads the invitation continuation only from a signup fragment', () => {
    const hash = '#invitationToken=invite%2B%26%3D%23';
    expect(
      readSensitiveEntryToken('/auth/signup', '?token=proof', hash),
    ).toEqual({
      kind: 'signup',
      token: 'proof',
      invitationToken: 'invite+&=#',
    });
    expect(
      readSensitiveEntryToken('/auth/magic-link', '?token=proof', hash),
    ).toEqual({
      kind: 'magicLink',
      token: 'proof',
    });
    expect(readSensitiveEntryToken('/auth/signup', '', hash)).toBeNull();
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

describe('external sign-in provider return', () => {
  it('reads the return of a provider from its callback path', () => {
    expect(
      readSensitiveEntryToken(
        '/auth/oidc/google',
        '?code=abc&state=xyz&scope=openid&authuser=0&prompt=none',
      ),
    ).toEqual({
      kind: 'oidc',
      token: 'xyz',
      connectionId: 'google',
      code: 'abc',
      providerError: false,
    });
  });

  it('reports a declined sign-in without a code', () => {
    expect(
      readSensitiveEntryToken(
        '/auth/oidc/google',
        '?error=access_denied&state=xyz',
      ),
    ).toMatchObject({ kind: 'oidc', code: null, providerError: true });
  });

  it('ignores a return without a state or without code and error', () => {
    expect(readSensitiveEntryToken('/auth/oidc/google', '?code=abc')).toBe(
      null,
    );
    expect(readSensitiveEntryToken('/auth/oidc/google', '?state=xyz')).toBe(
      null,
    );
  });

  it('rejects an unsafe connection segment', () => {
    expect(
      readSensitiveEntryToken('/auth/oidc/a%2Fb', '?code=abc&state=xyz'),
    ).toBe(null);
    expect(
      readSensitiveEntryToken('/auth/oidc/a/b', '?code=abc&state=xyz'),
    ).toBe(null);
  });

  it('removes every provider return parameter from the address', () => {
    expect(
      stripSensitiveEntryToken(
        '?code=abc&state=xyz&scope=openid&authuser=0&prompt=none&keep=1',
      ),
    ).toBe('/?keep=1');
  });
});
