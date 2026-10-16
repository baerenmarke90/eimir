import { AuthApi } from '../api/generated/apis/AuthApi';
import type { SignupSessionView } from '../api/generated/models/SignupSessionView';
import { consumeSignup, requestSignup } from './identityFlow';

describe('identityFlow signup methods', () => {
  it('requests signup proof with proper email request body', async () => {
    const spy = vi
      .spyOn(AuthApi.prototype, 'requestSignupApiV1AuthSignupRequestPost')
      .mockResolvedValue();

    try {
      await requestSignup('https://eimir.invalid', 'couple@example.invalid');
      expect(spy).toHaveBeenCalledWith({
        emailRequest: { email: 'couple@example.invalid' },
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
});
