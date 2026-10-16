import { AuthApi } from '../api/generated/apis/AuthApi';
import { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import { Configuration } from '../api/generated/runtime';

export interface ServerAdminApis {
  auth: AuthApi;
  serverAdmin: ServerAdminApi;
}

export function createServerAdminApis(
  apiBaseUrl: string,
  accessToken?: string,
): ServerAdminApis {
  const configuration = new Configuration({
    basePath: apiBaseUrl,
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });

  return {
    auth: new AuthApi(configuration),
    serverAdmin: new ServerAdminApi(configuration),
  };
}
