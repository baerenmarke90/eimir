import { PeopleApi } from '../api/generated/apis/PeopleApi';
import { Configuration } from '../api/generated/runtime';

export function createPeopleApi(
  apiBaseUrl: string,
  accessToken: string,
): PeopleApi {
  return new PeopleApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}
