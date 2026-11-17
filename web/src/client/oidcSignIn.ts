import type { SessionView } from '../api/generated/models/SessionView';
import { normalizeClientError } from './problemDetails';
import { createReferenceApis } from './referenceFlow';

const WEB_DEVICE_NAME = 'eimir. Web';
const WEB_PLATFORM = 'web';

export interface OidcStartOptions {
  /** Create a new Account if the provider identity has none (Cloud). */
  signup?: boolean;
  /** Terms version accepted before leaving; stored with the request server-side. */
  acceptedTermsVersion?: string | null;
  /** Invitation to join; bound to the request server-side, never sent to the provider. */
  invitationToken?: string | null;
}

/**
 * Where the provider sends the person back to. The state travels in the URL;
 * everything that must survive the redirect (invitation, terms, intent) is
 * held by the server, so no client storage is needed.
 */
async function authorizationUrl(
  start: () => Promise<{ authorizationUrl: string }>,
): Promise<string> {
  try {
    const started = await start();
    const url = new URL(started.authorizationUrl);
    if (url.protocol !== 'https:') {
      throw new Error('The sign-in provider returned an unsafe address.');
    }
    return url.toString();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function startOidcSignIn(
  apiBaseUrl: string,
  connectionId: string,
  options: OidcStartOptions = {},
): Promise<string> {
  const { auth } = createReferenceApis(apiBaseUrl);
  return authorizationUrl(() =>
    auth.startOidcApiV1AuthOidcConnectionIdStartPost({
      connectionId,
      oidcStartRequest: {
        ...(options.signup ? { signup: true } : {}),
        ...(options.acceptedTermsVersion
          ? { acceptedTermsVersion: options.acceptedTermsVersion }
          : {}),
        ...(options.invitationToken
          ? { invitationToken: options.invitationToken }
          : {}),
      },
    }),
  );
}

export async function startOidcLink(
  apiBaseUrl: string,
  accessToken: string,
  connectionId: string,
): Promise<string> {
  const { auth } = createReferenceApis(apiBaseUrl, accessToken);
  return authorizationUrl(() =>
    auth.linkOidcApiV1AuthOidcConnectionIdLinkPost({ connectionId }),
  );
}

export async function completeOidcSignIn(
  apiBaseUrl: string,
  connectionId: string,
  code: string,
  state: string,
): Promise<SessionView> {
  try {
    return await createReferenceApis(
      apiBaseUrl,
    ).auth.completeOidcApiV1AuthOidcConnectionIdCallbackPost({
      connectionId,
      eimirApiV1AuthOidcCallbackRequest: {
        code,
        state,
        deviceName: WEB_DEVICE_NAME,
        platform: WEB_PLATFORM,
      },
    });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

/** Leave for the provider in this window; the return arrives as an entry link. */
export function goToProvider(url: string): void {
  window.location.assign(url);
}
