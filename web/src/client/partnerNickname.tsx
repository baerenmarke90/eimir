import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { PartnerNicknameView } from '../api/generated/models/PartnerNicknameView';
import { firstNameFromDisplayName } from './personalName';
import { normalizeClientError } from './problemDetails';

type PartnerNicknameContextValue = {
  state: PartnerNicknameView | null;
  nicknameFor: (accountId: string | null | undefined) => string | null;
  relationshipLabel: (
    accountId: string | null | undefined,
    displayName: string | null | undefined,
    fallback: string,
  ) => string;
};

const PartnerNicknameContext = createContext<PartnerNicknameContextValue>({
  state: null,
  nicknameFor: () => null,
  relationshipLabel: (_accountId, displayName, fallback) =>
    firstNameFromDisplayName(displayName, fallback),
});

export function partnerNicknameQueryKey(spaceId: string, accountId: string) {
  return ['partner-nickname', spaceId, accountId] as const;
}

export function PartnerNicknameProvider({
  profilesApi,
  spaceId,
  accountId,
  children,
}: {
  profilesApi: ProfilesApi;
  spaceId: string;
  accountId: string;
  children: ReactNode;
}) {
  const query = useQuery({
    queryKey: partnerNicknameQueryKey(spaceId, accountId),
    queryFn: async () => {
      try {
        return await profilesApi.getPartnerNickname({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const value = useMemo<PartnerNicknameContextValue>(() => {
    const nicknameFor = (personId: string | null | undefined) =>
      personId && personId === query.data?.partnerId
        ? (query.data.nickname ?? null)
        : null;
    return {
      state: query.data ?? null,
      nicknameFor,
      relationshipLabel: (personId, displayName, fallback) =>
        nicknameFor(personId) || firstNameFromDisplayName(displayName, fallback),
    };
  }, [query.data]);

  return (
    <PartnerNicknameContext.Provider value={value}>
      {children}
    </PartnerNicknameContext.Provider>
  );
}

export function usePartnerNickname(): PartnerNicknameContextValue {
  return useContext(PartnerNicknameContext);
}
