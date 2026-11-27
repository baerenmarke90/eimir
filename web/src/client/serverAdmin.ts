import { AuthApi } from '../api/generated/apis/AuthApi';
import { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import { ServerAdminProApi } from '../api/generated/apis/ServerAdminProApi';
import { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import { Configuration } from './apiConfiguration';

export interface ServerAdminApis {
  auth: AuthApi;
  serverAdmin: ServerAdminApi;
  supportReports: ServerAdminSupportReportsApi;
  /** Pro overview and gift codes; the routes exist only on eimir. Cloud. */
  pro: ServerAdminProApi;
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
    supportReports: new ServerAdminSupportReportsApi(configuration),
    pro: new ServerAdminProApi(configuration),
  };
}
