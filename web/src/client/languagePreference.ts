import { AccountApi } from '../api/generated/apis/AccountApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { LanguagePreferenceView } from '../api/generated/models/LanguagePreferenceView';
import { deviceLanguages } from '../i18n/locale';
import { Configuration } from './apiConfiguration';
import { normalizeClientError } from './problemDetails';

export function languagePreferenceKey(instance: string, accountId: string) {
  return ['account-language', instance, accountId] as const;
}

export function languageApi(instance: string, accessToken: string) {
  return new AccountApi(
    new Configuration({
      basePath: instance,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}

export function accountLanguage(account: AccountView): LanguagePreferenceView {
  return {
    preference: account.languagePreference ?? 'auto',
    effectiveLocale: account.locale ?? 'de',
    version: account.languageVersion ?? 0,
  };
}

export async function loadLanguagePreference(
  api: AccountApi,
  signal: AbortSignal,
) {
  try {
    return await api.getLanguagePreference({ signal });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function saveLanguagePreference(
  api: AccountApi,
  preference: string,
  version: number,
  signal?: AbortSignal,
) {
  try {
    return await api.setLanguagePreference(
      {
        ifMatch: `"${version}"`,
        languagePreferenceUpdate: {
          preference,
          deviceLanguages: deviceLanguages(),
        },
      },
      { signal },
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}
