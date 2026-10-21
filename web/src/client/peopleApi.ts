import { PeopleApi } from '../api/generated/apis/PeopleApi';
import { Configuration } from './apiConfiguration';

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
