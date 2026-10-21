import { AttachmentsApi as GeneratedAttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { ProfilesApi as GeneratedProfilesApi } from '../api/generated/apis/ProfilesApi';
import {
  DefaultConfig,
  type Configuration as GeneratedConfiguration,
} from '../api/generated/runtime';
import { Configuration } from './apiConfiguration';
import {
  mediaCacheScopeForOwner,
  registerMediaClient,
} from './authorizedMediaCache';

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
