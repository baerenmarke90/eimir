import {
  classifyRegistrationAvailability,
  isInvitationOnly,
  isSelfServiceSignupAllowed,
  loadInstanceAccessStatus,
  loadRegistrationAvailability,
} from './instanceStatus';

describe('instance registration availability', () => {
  it('distinguishes available, administrator-disabled and maintenance states', () => {
    expect(
      classifyRegistrationAvailability({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
      }),
    ).toBe('available');
    expect(
      classifyRegistrationAvailability({
        maintenanceMode: false,
        registrationAvailable: false,
        registrationUnavailableReason: 'administrator',
      }),
    ).toBe('administrator');
    expect(
      classifyRegistrationAvailability({
        maintenanceMode: true,
        registrationAvailable: false,
        registrationUnavailableReason: 'maintenance',
      }),
    ).toBe('maintenance');
  });

  it('correctly loads cloud self-service signup capabilities', async () => {
    const status = await loadInstanceAccessStatus(
      'https://cloud.invalid',
      async () => ({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        accountCreation: 'self_service',
        selfServiceSignupAvailable: true,
        auth: {
          magicLink: true,
          localPassword: false,
          oidc: false,
          passkey: false,
        },
      }),
    );

    expect(status.accountCreation).toBe('self_service');
    expect(status.selfServiceSignupAvailable).toBe(true);
    expect(status.availability).toBe('available');
    expect(isSelfServiceSignupAllowed(status)).toBe(true);
    expect(isInvitationOnly(status)).toBe(false);
  });

  it('suppresses self-service signup when administrator disables registration', async () => {
    const status = await loadInstanceAccessStatus(
      'https://cloud.invalid',
      async () => ({
        maintenanceMode: false,
        registrationAvailable: false,
        registrationUnavailableReason: 'administrator',
        accountCreation: 'self_service',
        selfServiceSignupAvailable: false,
        auth: {
          magicLink: true,
          localPassword: false,
          oidc: false,
          passkey: false,
        },
      }),
    );

    expect(status.accountCreation).toBe('self_service');
    expect(status.selfServiceSignupAvailable).toBe(false);
    expect(status.availability).toBe('administrator');
    expect(isSelfServiceSignupAllowed(status)).toBe(false);
    expect(isInvitationOnly(status)).toBe(false);
  });

  it('identifies self-hosted invitation-only deployments authoritatively', async () => {
    const status = await loadInstanceAccessStatus(
      'https://selfhosted.invalid',
      async () => ({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        accountCreation: 'invitation',
        selfServiceSignupAvailable: false,
        auth: {
          magicLink: false,
          localPassword: true,
          oidc: false,
          passkey: false,
        },
      }),
    );

    expect(status.accountCreation).toBe('invitation');
    expect(status.selfServiceSignupAvailable).toBe(false);
    expect(status.availability).toBe('available');
    expect(isSelfServiceSignupAllowed(status)).toBe(false);
    expect(isInvitationOnly(status)).toBe(true);
  });

  it('keeps connectivity failure distinct and fails closed for registration UI', async () => {
    await expect(
      loadRegistrationAvailability('https://eimir.invalid', async () => {
        throw new TypeError('network unavailable');
      }),
    ).resolves.toBe('unreachable');

    const closed = await loadInstanceAccessStatus(
      'https://eimir.invalid',
      async () => {
        throw new TypeError('network unavailable');
      },
    );
    expect(closed.availability).toBe('unreachable');
    expect(closed.accountCreation).toBe('invitation');
    expect(closed.selfServiceSignupAvailable).toBe(false);
    expect(isSelfServiceSignupAllowed(closed)).toBe(false);
  });
});
