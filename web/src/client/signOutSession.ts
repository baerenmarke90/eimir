import { createM4ProductApis } from './m4Product';
import { createReferenceApis } from './referenceFlow';
import {
  captureSessionOwner,
  currentSessionTokens,
  loadStoredSession,
} from './sessionPersistence';
import {
  revokeDevicePushBeforeSignOut,
  stopNativePushForSignedOutAccount,
} from './unifiedPush';

/** Bound best-effort remote cleanup so an outage cannot prevent local sign-out. */
export const SIGN_OUT_CLEANUP_TIMEOUT_MS = 5_000;

export async function signOutSession(
  apiBaseUrl: string,
  accessToken: string | undefined,
  onSignedOut: () => void | Promise<void>,
): Promise<void> {
  const owner = accessToken ? captureSessionOwner(accessToken) : null;
  stopNativePushForSignedOutAccount();
  if (!owner || !accessToken) {
    if (!loadStoredSession()) await onSignedOut();
    return;
  }

  const abort = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    deadline = setTimeout(() => {
      abort.abort();
      resolve();
    }, SIGN_OUT_CLEANUP_TIMEOUT_MS);
  });
  const cleanup = async () => {
    const apis = createReferenceApis(apiBaseUrl, accessToken);
    await revokeDevicePushBeforeSignOut(
      apiBaseUrl,
      owner.accountId,
      createM4ProductApis(apiBaseUrl, accessToken).notifications,
      abort.signal,
    );
    abort.signal.throwIfAborted();
    if (currentSessionTokens(owner)) {
      await apis.auth.signOutApiV1AuthSignOutPost({ signal: abort.signal });
    }
  };
  try {
    await Promise.race([cleanup(), timeout]);
  } catch {
    // Local sign-out still completes; the saved endpoint ID permits later cleanup.
  } finally {
    clearTimeout(deadline);
    abort.abort();
    // Remote work belongs to the original login, including its own rotations.
    if (currentSessionTokens(owner) || !loadStoredSession())
      await onSignedOut();
  }
}
