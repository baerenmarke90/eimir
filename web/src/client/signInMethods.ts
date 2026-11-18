import type { SignInMethodsView } from '../api/generated/models/SignInMethodsView';
import { normalizeClientError } from './problemDetails';
import { createReferenceApis } from './referenceFlow';

export const SIGN_IN_METHODS_QUERY_KEY = ['sign-in-methods'] as const;

export async function loadSignInMethods(
  apiBaseUrl: string,
  accessToken: string,
): Promise<SignInMethodsView> {
  try {
    return await createReferenceApis(
      apiBaseUrl,
      accessToken,
    ).auth.listSignInMethodsApiV1AuthSignInMethodsGet();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function removePasskey(
  apiBaseUrl: string,
  accessToken: string,
  passkeyId: string,
): Promise<void> {
  try {
    await createReferenceApis(
      apiBaseUrl,
      accessToken,
    ).auth.removePasskeyApiV1AuthPasskeysPasskeyIdDelete({ passkeyId });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function unlinkProvider(
  apiBaseUrl: string,
  accessToken: string,
  connectionId: string,
): Promise<void> {
  try {
    await createReferenceApis(
      apiBaseUrl,
      accessToken,
    ).auth.unlinkOidcApiV1AuthOidcConnectionIdDelete({ connectionId });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}
