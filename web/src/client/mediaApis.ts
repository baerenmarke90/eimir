import { AttachmentsApi as GeneratedAttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { ProfilesApi as GeneratedProfilesApi } from '../api/generated/apis/ProfilesApi';
import { StoryApi as GeneratedStoryApi } from '../api/generated/apis/StoryApi';
import { DashboardApi as GeneratedDashboardApi } from '../api/generated/apis/DashboardApi';
import type { StoryItem } from '../api/generated/models/StoryItem';
import {
  DefaultConfig,
  type Configuration as GeneratedConfiguration,
} from '../api/generated/runtime';
import { Configuration } from './apiConfiguration';
import {
  mediaCacheScopeForOwner,
  registerMediaClient,
  captureMediaCacheLease,
  rememberAuthorizedMediaPreviews,
  assertMediaCacheLease,
  evictAuthorizedMedia,
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

function rememberStoryPreviews(
  lease: ReturnType<typeof captureMediaCacheLease>,
  items: readonly StoryItem[],
): void {
  rememberAuthorizedMediaPreviews(
    lease,
    items.flatMap((item) => {
      const parent =
        item.kind === 'MEMORY'
          ? item.memory
          : item.kind === 'HEART_MOMENT'
            ? item.heartMoment
            : null;
      if (!parent) return [];
      const attachments =
        'attachments' in parent
          ? parent.attachments
          : parent.attachment
            ? [parent.attachment]
            : [];
      return attachments
        .filter(
          (attachment) =>
            attachment.status === 'READY' && attachment.hasThumbnail,
        )
        .map((attachment) => [
          'attachment',
          item.kind,
          parent.id,
          attachment.id,
          'thumbnail',
        ]);
    }),
  );
}

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

/** Only completed authenticated network projections can shortcut cached previews. */
export class StoryApi extends GeneratedStoryApi {
  constructor(configuration: GeneratedConfiguration = DefaultConfig) {
    super(configuration);
    register(this, configuration);
  }

  override async getStoryTimeline(
    ...args: Parameters<GeneratedStoryApi['getStoryTimeline']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    const result = await readMediaProjection(lease, () =>
      super.getStoryTimeline(...args),
    );
    rememberStoryPreviews(lease, result.items);
    return result;
  }

  override async getStoryDiscover(
    ...args: Parameters<GeneratedStoryApi['getStoryDiscover']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    const result = await readMediaProjection(lease, () =>
      super.getStoryDiscover(...args),
    );
    rememberStoryPreviews(lease, [
      ...result.items,
      ...(result.lead ? [result.lead] : []),
    ]);
    return result;
  }

  override async renewStoryDiscover(
    ...args: Parameters<GeneratedStoryApi['renewStoryDiscover']>
  ) {
    const lease = captureMediaCacheLease(this, args[0].spaceId);
    const result = await readMediaProjection(lease, () =>
      super.renewStoryDiscover(...args),
    );
    rememberStoryPreviews(lease, [
      ...result.items,
      ...(result.lead ? [result.lead] : []),
    ]);
    return result;
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
    const result = await readMediaProjection(lease, () =>
      super.getDashboard(...args),
    );
    rememberAuthorizedMediaPreviews(
      lease,
      [...result.recentShared, result.keepsake, result.retrospective].flatMap(
        (item) =>
          item?.type === 'MEMORY' &&
          item.previewAttachmentId &&
          item.previewHasThumbnail
            ? [
                [
                  'attachment',
                  'MEMORY',
                  item.id,
                  item.previewAttachmentId,
                  'thumbnail',
                ],
              ]
            : [],
      ),
    );
    return result;
  }
}
