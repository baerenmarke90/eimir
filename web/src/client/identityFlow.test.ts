import { AuthApi } from '../api/generated/apis/AuthApi';
import type { SignupSessionView } from '../api/generated/models/SignupSessionView';
import { InvitationsApi } from '../api/generated/apis/InvitationsApi';
import {
  consumeSignup,
  requestSignup,
  signInAndJoinInvitation,
  revokeUnacceptedSession,
} from './identityFlow';
import {
  clearStoredSession,
  storeSession,
  refreshSessionTokens,
} from './sessionPersistence';

describe('identityFlow signup methods', () => {
  it.each(['password', 'legacyMailbox'] as const)(
    'revokes unused %s credentials after invitation acceptance fails',
    async (kind) => {
      const session: SignupSessionView = {
        account: { id: 'partner', displayName: 'Partner' },
        tokens: {
          accessToken: 'unused-access',
          refreshToken: 'unused-refresh',
          accessExpiresAt: new Date('2099-01-01'),
          refreshExpiresAt: new Date('2099-02-01'),
        },
        accountCreated: false,
      };
      const signIn = vi
        .spyOn(AuthApi.prototype, 'signInApiV1AuthSignInPost')
        .mockResolvedValue(session);
      const consume = vi
        .spyOn(AuthApi.prototype, 'consumeSignupApiV1AuthSignupConsumePost')
        .mockResolvedValue(session);
      const accept = vi
        .spyOn(
          InvitationsApi.prototype,
          'acceptInvitationApiV1InvitationsAcceptPost',
        )
        .mockRejectedValue({ status: 409, code: 'INVITATION_UNAVAILABLE' });
      const signOut = vi
        .spyOn(AuthApi.prototype, 'signOutApiV1AuthSignOutPost')
        .mockRejectedValue(new Error('Transport unavailable'));
      try {
        await expect(
          kind === 'password'
            ? signInAndJoinInvitation(
                'https://instance.example',
                'partner@example.invalid',
                'fictional',
                'invite',
              )
            : consumeSignup('https://instance.example', 'proof', 'invite'),
        ).rejects.toMatchObject({
          status: 409,
          code: 'INVITATION_UNAVAILABLE',
        });
        expect(signOut).toHaveBeenCalledOnce();
      } finally {
        signIn.mockRestore();
        consume.mockRestore();
        accept.mockRestore();
        signOut.mockRestore();
      }
    },
  );

  it.each([false, true])(
    'never revokes an accepted active session during stale-response cleanup (rotated: %s)',
    async (rotated) => {
      const memory = new Map<string, string>();
      vi.stubGlobal('window', {
        sessionStorage: {
          getItem: (key: string) => memory.get(key) ?? null,
          setItem: (key: string, value: string) => memory.set(key, value),
          removeItem: (key: string) => memory.delete(key),
        },
      });
      const session = {
        account: { id: 'partner', displayName: 'Partner' },
        tokens: {
          accessToken: 'active-access',
          refreshToken: 'active-refresh',
          accessExpiresAt: new Date('2099-01-01'),
          refreshExpiresAt: new Date('2099-02-01'),
        },
      };
      const signOut = vi
        .spyOn(AuthApi.prototype, 'signOutApiV1AuthSignOutPost')
        .mockResolvedValue();
      const refresh = vi
        .spyOn(AuthApi.prototype, 'refreshApiV1AuthRefreshPost')
        .mockResolvedValue({
          ...session.tokens,
          accessToken: 'rotated-access',
          refreshToken: 'rotated-refresh',
        });
      try {
        await storeSession(session);
        if (rotated)
          await refreshSessionTokens(
            'https://instance.example',
            session.tokens.refreshToken,
          );
        await revokeUnacceptedSession('https://instance.example', session);
        expect(signOut).not.toHaveBeenCalled();
      } finally {
        await clearStoredSession();
        vi.unstubAllGlobals();
        signOut.mockRestore();
        refresh.mockRestore();
      }
    },
  );
  it('requests signup proof with proper email request body', async () => {
    const spy = vi
      .spyOn(AuthApi.prototype, 'requestSignupApiV1AuthSignupRequestPost')
      .mockResolvedValue();

    try {
      await requestSignup('https://eimir.invalid', 'couple@example.invalid');
      expect(spy).toHaveBeenCalledWith({
        signupEmailRequest: { email: 'couple@example.invalid' },
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('carries an invitation only in the signup request body', async () => {
    const spy = vi
      .spyOn(AuthApi.prototype, 'requestSignupApiV1AuthSignupRequestPost')
      .mockResolvedValue();
    try {
      await requestSignup(
        'https://eimir.invalid',
        'couple@example.invalid',
        'invite',
      );
      expect(spy).toHaveBeenCalledWith({
        signupEmailRequest: {
          email: 'couple@example.invalid',
          invitationToken: 'invite',
        },
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('consumes signup proof and forwards web client metadata', async () => {
    const mockSession: SignupSessionView = {
      account: {
        id: 'acc-123',
        displayName: 'Partner A',
      },
      tokens: {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        accessExpiresAt: new Date('2026-09-14T16:00:00Z'),
        refreshExpiresAt: new Date('2026-09-28T16:00:00Z'),
      },
      accountCreated: true,
    };

    const spy = vi
      .spyOn(AuthApi.prototype, 'consumeSignupApiV1AuthSignupConsumePost')
      .mockResolvedValue(mockSession);

    try {
      const result = await consumeSignup(
        'https://eimir.invalid',
        'signup-proof-token',
      );
      expect(spy).toHaveBeenCalledWith({
        signupConsumeRequest: {
          token: 'signup-proof-token',
          deviceName: 'eimir. Web',
          platform: 'web',
        },
      });
      expect(result).toEqual(mockSession);
      expect(result.accountCreated).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('accepts the invitation only after the mailbox proof authenticates', async () => {
    const session: SignupSessionView = {
      account: { id: 'partner', displayName: 'Partner' },
      tokens: {
        accessToken: 'authenticated-access',
        refreshToken: 'refresh',
        accessExpiresAt: new Date('2026-10-18T22:00:00Z'),
        refreshExpiresAt: new Date('2026-10-19T22:00:00Z'),
      },
      accountCreated: true,
    };
    const consume = vi
      .spyOn(AuthApi.prototype, 'consumeSignupApiV1AuthSignupConsumePost')
      .mockResolvedValue(session);
    const accept = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          spaceId: 'shared-space',
          role: 'PARTNER',
          status: 'ACTIVE',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    try {
      expect(
        await consumeSignup('https://eimir.invalid', 'proof', 'invite'),
      ).toEqual({ ...session, spaceId: 'shared-space' });
      const [url, request] = accept.mock.calls[0];
      expect(url).toBe('https://eimir.invalid/api/v1/invitations/accept');
      expect(new Headers(request?.headers).get('Authorization')).toBe(
        'Bearer authenticated-access',
      );
      expect(JSON.parse(String(request?.body))).toEqual({ token: 'invite' });
      expect(consume.mock.invocationCallOrder[0]).toBeLessThan(
        accept.mock.invocationCallOrder[0],
      );
      const boundSession = { ...session, spaceId: 'server-bound-space' };
      consume.mockResolvedValueOnce(boundSession);
      await expect(
        consumeSignup('https://eimir.invalid', 'bound-proof', 'another-invite'),
      ).resolves.toEqual(boundSession);
      expect(accept).toHaveBeenCalledTimes(1);
      consume.mockRejectedValueOnce(new Error('Proof expired'));
      await expect(
        consumeSignup('https://eimir.invalid', 'expired', 'invite'),
      ).rejects.toThrow();
      expect(accept).toHaveBeenCalledTimes(1);
    } finally {
      consume.mockRestore();
      accept.mockRestore();
    }
  });
});
