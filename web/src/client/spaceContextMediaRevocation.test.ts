import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadAuthorizedMemberships } from './spaceContext';
import {
  assertMediaCacheLease,
  captureMediaCacheLease,
  clearAuthorizedMediaCache,
  mediaCacheScopeForOwner,
  registerMediaClient,
} from './authorizedMediaCache';
import { acquireMediaObjectUrl } from './sharedMediaObjectUrls';
import { ClientProblemError } from './problemDetails';

const fixture = vi.hoisted(() => ({
  memberships: vi.fn(),
  attachments: {},
  current: true,
}));
vi.mock('./referenceFlow', () => ({
  createReferenceApis: () => ({
    attachments: fixture.attachments,
    auth: {
      listAccountMembershipsApiV1AuthMembershipsGet: fixture.memberships,
    },
  }),
}));
vi.mock('./sessionPersistence', () => ({
  loadStoredSession: () => ({ spaceId: 'space' }),
}));

beforeEach(() => {
  fixture.current = true;
  fixture.memberships.mockReset();
  registerMediaClient(
    fixture.attachments,
    mediaCacheScopeForOwner({}, 'api', () => fixture.current),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:authorized-photo');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  clearAuthorizedMediaCache();
  vi.restoreAllMocks();
});

function retainedPhoto() {
  const lease = captureMediaCacheLease(fixture.attachments, 'space', [
    'attachment',
    'MEMORY',
    'memory',
  ]);
  const resource = acquireMediaObjectUrl(
    JSON.stringify([
      lease.scope.id,
      'space',
      'attachment',
      'MEMORY',
      'memory',
      'photo',
      'original',
    ]),
    new Blob(['photo']),
  );
  resource.dispose();
  return { lease, resource };
}

it.each(['unauthorized', 'permission', 'notFound'] as const)(
  'revokes retained pixels and pending parent leases after a membership %s denial',
  async (kind) => {
    const { lease, resource } = retainedPhoto();
    fixture.memberships.mockRejectedValue(new ClientProblemError(kind));
    await expect(
      loadAuthorizedMemberships('api', 'token'),
    ).rejects.toMatchObject({ kind });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(resource.url);
    expect(() => assertMediaCacheLease(lease)).toThrow();
  },
);

it.each(['offline', 'server', 'rateLimit'] as const)(
  'preserves image ownership during a transient membership %s failure',
  async (kind) => {
    const { lease } = retainedPhoto();
    fixture.memberships.mockRejectedValue(new ClientProblemError(kind));
    await expect(
      loadAuthorizedMemberships('api', 'token'),
    ).rejects.toMatchObject({ kind });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(() => assertMediaCacheLease(lease)).not.toThrow();
  },
);

it('revokes retained images when the authoritative membership set no longer includes their Space', async () => {
  const { lease } = retainedPhoto();
  fixture.memberships.mockResolvedValue([]);
  expect(await loadAuthorizedMemberships('api', 'token')).toEqual([]);
  expect(() => assertMediaCacheLease(lease)).toThrow();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it('does not revoke media on a response whose account scope has expired', async () => {
  retainedPhoto();
  fixture.memberships.mockImplementation(async () => {
    fixture.current = false;
    throw new ClientProblemError('permission');
  });
  await expect(
    loadAuthorizedMemberships('api', 'old-token'),
  ).rejects.toMatchObject({ kind: 'permission' });
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});
