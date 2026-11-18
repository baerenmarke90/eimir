import { AttachmentsApi as GeneratedAttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { DashboardApi as GeneratedDashboardApi } from '../api/generated/apis/DashboardApi';
import { PlacesApi as GeneratedPlacesApi } from '../api/generated/apis/PlacesApi';
import { ProfilesApi as GeneratedProfilesApi } from '../api/generated/apis/ProfilesApi';
import { StoryApi as GeneratedStoryApi } from '../api/generated/apis/StoryApi';
import {
  DefaultConfig,
  type Configuration as GeneratedConfiguration,
} from '../api/generated/runtime';
import { Configuration } from './apiConfiguration';
import {
  assertMediaCacheLease,
  captureMediaCacheLease,
  evictAuthorizedMedia,
  mediaCacheScopeForOwner,
  registerMediaClient,
} from './authorizedMediaCache';
import { clientProblemKind, normalizeClientError } from './problemDetails';

function register(client: object, configuration: GeneratedConfiguration): void {
  registerMediaClient(
    client,
    configuration instanceof Configuration
      ? configuration.mediaCacheScope
      : mediaCacheScopeForOwner(
          configuration,
          configuration.basePath,
          () => true,
        ),
  );
}

/** Generated contracts/transport with a stable login-scoped media identity. */
export class AttachmentsApi extends GeneratedAttachmentsApi {
  get contentBaseUrl(): string {
    return this.configuration.basePath;
  }

  constructor(configuration: GeneratedConfiguration = DefaultConfig) {
    super(configuration);
    register(this, configuration);
  }
}

export class ProfilesApi extends GeneratedProfilesApi {
  constructor(configuration: GeneratedConfiguration = DefaultConfig) {
    super(configuration);
    register(this, configuration);
  }
}

/**
 * Parent lists are the background truth for stored media: a denied list
 * evicts every stored byte of that Space, so revoked access cannot keep
 * showing images that the parent data no longer lists.
 */
async function readMediaProjection<T>(
  lease: ReturnType<typeof captureMediaCacheLease>,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const problem = await normalizeClientError(error);
    if (
      ['unauthorized', 'permission', 'notFound'].includes(
        clientProblemKind(problem),
      )
    ) {
      try {
        assertMediaCacheLease(lease);
        evictAuthorizedMedia(lease, []);
      } catch {
        // A late denied read must not revoke a replacement session's media.
      }
    }
    throw error;
  }
}

export class PlacesApi extends GeneratedPlacesApi {
  constructor(configuration: GeneratedConfiguration = DefaultConfig) {
    super(configuration);
    register(this, configuration);
  }

  override async listMemoryMap(
    ...args: Parameters<GeneratedPlacesApi['listMemoryMap']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    return readMediaProjection(lease, () => super.listMemoryMap(...args));
  }
}

export class StoryApi extends GeneratedStoryApi {
  constructor(configuration: GeneratedConfiguration = DefaultConfig) {
    super(configuration);
    register(this, configuration);
  }

  override async getStoryTimeline(
    ...args: Parameters<GeneratedStoryApi['getStoryTimeline']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    return readMediaProjection(lease, () => super.getStoryTimeline(...args));
  }

  override async getStoryDiscover(
    ...args: Parameters<GeneratedStoryApi['getStoryDiscover']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    return readMediaProjection(lease, () => super.getStoryDiscover(...args));
  }

  override async renewStoryDiscover(
    ...args: Parameters<GeneratedStoryApi['renewStoryDiscover']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    return readMediaProjection(lease, () => super.renewStoryDiscover(...args));
  }

  override async getMediaGallery(
    ...args: Parameters<GeneratedStoryApi['getMediaGallery']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    return readMediaProjection(lease, () => super.getMediaGallery(...args));
  }
}

export class DashboardApi extends GeneratedDashboardApi {
  constructor(configuration: GeneratedConfiguration = DefaultConfig) {
    super(configuration);
    register(this, configuration);
  }

  override async getDashboard(
    ...args: Parameters<GeneratedDashboardApi['getDashboard']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    return readMediaProjection(lease, () => super.getDashboard(...args));
  }
}
