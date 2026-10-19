import { InvitationsApi } from '../api/generated/apis/InvitationsApi';
import type { SessionView } from '../api/generated/models/SessionView';
import type { SignupSessionView } from '../api/generated/models/SignupSessionView';
import type { MembershipView } from '../api/generated/models/MembershipView';
import { Configuration } from './apiConfiguration';
import { normalizeClientError } from './problemDetails';
import { createReferenceApis } from './referenceFlow';
import {
  captureSessionOwner,
  loadStoredSession,
  type StoredSession,
} from './sessionPersistence';

const WEB_DEVICE_NAME = 'eimir. Web';
const WEB_PLATFORM = 'web';

export class ActiveAccountMismatchError extends Error {
  constructor() {
    super('Identity entry cannot replace an active account.');
    this.name = 'ActiveAccountMismatchError';
  }
}

/** Dispose of newly issued credentials that no active entry accepted. */
export async function revokeUnacceptedSession(
  apiBaseUrl: string,
  session: StoredSession,
): Promise<void> {
  if (
    loadStoredSession()?.tokens.refreshToken === session.tokens.refreshToken ||
    captureSessionOwner(session.tokens.accessToken)
  )
    return;
  try {
    await createReferenceApis(
      apiBaseUrl,
      session.tokens.accessToken,
    ).auth.signOutApiV1AuthSignOutPost();
  } catch {
    // Best effort only; never replace the original entry error or log tokens.
  }
}

// Auth-return restoration deliberately does not happen here (#689): the
// Account that just authenticated is known immediately, but its active
// Space is not resolved until later membership/space-context loading
// completes. App.tsx restores the remembered target once both are known,
// so a Space-bound route is never blindly restored into the wrong Space.
// Calling `rememberCurrentAuthReturnTarget()` again here, before any
// Account is known, would also have overwritten an already-correctly-
// bound target (from a prior session's expiry) with an unbound one.

export async function signInAndJoinInvitation(
  apiBaseUrl: string,
  email: string,
  password: string,
  invitationToken?: string | null,
): Promise<StoredSession> {
  try {
    const session = await createReferenceApis(
      apiBaseUrl,
    ).auth.signInApiV1AuthSignInPost({
      signInRequest: {
        email,
        password,
        deviceName: WEB_DEVICE_NAME,
        platform: WEB_PLATFORM,
      },
    });

    if (!invitationToken) {
      return session;
    }

    const membership = await joinInvitation(
      apiBaseUrl,
      session,
      invitationToken,
    );
    return { ...session, spaceId: membership.spaceId };
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

async function joinInvitation(
  apiBaseUrl: string,
  session: SessionView,
  invitationToken: string,
): Promise<MembershipView> {
  const invitations = new InvitationsApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    }),
  );
  try {
    return await invitations.acceptInvitationApiV1InvitationsAcceptPost({
      acceptRequest: { token: invitationToken },
    });
  } catch (error) {
    void revokeUnacceptedSession(apiBaseUrl, session);
    throw error;
  }
}

export async function registerFromInvitation(
  apiBaseUrl: string,
  displayName: string,
  email: string,
  password: string,
  invitationToken: string,
): Promise<SessionView> {
  try {
    return await createReferenceApis(
      apiBaseUrl,
    ).auth.registerApiV1AuthRegisterPost({
      registerRequest: {
        displayName,
        email,
        password,
        invitationToken,
        deviceName: WEB_DEVICE_NAME,
        platform: WEB_PLATFORM,
      },
    });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function requestPasswordRecovery(
  apiBaseUrl: string,
  email: string,
): Promise<void> {
  try {
    await createReferenceApis(
      apiBaseUrl,
    ).auth.requestRecoveryApiV1AuthRecoveryRequestPost({
      emailRequest: { email },
    });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function completePasswordRecovery(
  apiBaseUrl: string,
  recoveryToken: string,
  newPassword: string,
): Promise<SessionView> {
  try {
    return await createReferenceApis(
      apiBaseUrl,
    ).auth.consumeRecoveryApiV1AuthRecoveryConsumePost({
      recoveryConsumeRequest: {
        token: recoveryToken,
        newPassword,
        deviceName: WEB_DEVICE_NAME,
        platform: WEB_PLATFORM,
      },
    });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function requestMagicLink(
  apiBaseUrl: string,
  email: string,
): Promise<void> {
  try {
    await createReferenceApis(
      apiBaseUrl,
    ).auth.requestMagicLinkApiV1AuthMagicLinkRequestPost({
      emailRequest: { email },
    });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function consumeMagicLink(
  apiBaseUrl: string,
  token: string,
): Promise<SessionView> {
  try {
    return await createReferenceApis(
      apiBaseUrl,
    ).auth.consumeMagicLinkApiV1AuthMagicLinkConsumePost({
      magicLinkConsumeRequest: {
        token,
        deviceName: WEB_DEVICE_NAME,
        platform: WEB_PLATFORM,
      },
    });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function confirmEmailAddress(
  apiBaseUrl: string,
  token: string,
): Promise<void> {
  try {
    await createReferenceApis(
      apiBaseUrl,
    ).auth.confirmEmailApiV1AuthEmailVerificationConfirmPost({
      tokenOnlyRequest: { token },
    });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function requestSignup(
  apiBaseUrl: string,
  email: string,
  invitationToken?: string | null,
): Promise<void> {
  try {
    await createReferenceApis(
      apiBaseUrl,
    ).auth.requestSignupApiV1AuthSignupRequestPost({
      signupEmailRequest: {
        email,
        ...(invitationToken ? { invitationToken } : {}),
      },
    });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function consumeSignup(
  apiBaseUrl: string,
  token: string,
  invitationToken?: string,
): Promise<SignupSessionView> {
  try {
    const session = await createReferenceApis(
      apiBaseUrl,
    ).auth.consumeSignupApiV1AuthSignupConsumePost({
      signupConsumeRequest: {
        token,
        deviceName: WEB_DEVICE_NAME,
        platform: WEB_PLATFORM,
      },
    });
    if (invitationToken && !session.spaceId) {
      const membership = await joinInvitation(
        apiBaseUrl,
        session,
        invitationToken,
      );
      return { ...session, spaceId: membership.spaceId };
    }
    return session;
  } catch (error) {
    throw await normalizeClientError(error);
  }
}
