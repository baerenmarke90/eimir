import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountMembershipView } from '../api/generated/models/AccountMembershipView';
import type { SpaceView } from '../api/generated/models/SpaceView';
import { Configuration } from './apiConfiguration';
import { clientProblemKind, normalizeClientError } from './problemDetails';
import { createReferenceApis } from './referenceFlow';

export async function loadAuthorizedMemberships(
  apiBaseUrl: string,
  accessToken: string,
): Promise<AccountMembershipView[]> {
  try {
    return await createReferenceApis(
      apiBaseUrl,
      accessToken,
    ).auth.listAccountMembershipsApiV1AuthMembershipsGet();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function loadAuthorizedSpaces(
  apiBaseUrl: string,
  accessToken: string,
  memberships: AccountMembershipView[],
): Promise<SpaceView[]> {
  const spaces = new SpacesApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );

  try {
    return await Promise.all(
      memberships.map((membership) =>
        spaces.getSpaceApiV1SpacesSpaceIdGet({
          spaceId: membership.spaceId,
        }),
      ),
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

/**
 * A transient background revalidation must not destroy an already authorized
 * product surface. Permission/identity failures remain fail-closed even when
 * a previous response is present.
 */
export function canReuseMembershipsAfterRefreshFailure(
  memberships: AccountMembershipView[] | undefined,
  error: unknown,
): boolean {
  if (!memberships?.length || !error) return false;
  return ['offline', 'server', 'rateLimit'].includes(clientProblemKind(error));
}

/**
 * Resolve an active Space exclusively from the server-authorized Membership set.
 * A single Membership can enter directly; multiple Spaces require an explicit choice.
 */
export function resolveActiveSpaceId(
  memberships: AccountMembershipView[],
  currentSpaceId: string | null,
): string | null {
  if (
    currentSpaceId &&
    memberships.some((membership) => membership.spaceId === currentSpaceId)
  ) {
    return currentSpaceId;
  }

  return memberships.length === 1 ? memberships[0].spaceId : null;
}
