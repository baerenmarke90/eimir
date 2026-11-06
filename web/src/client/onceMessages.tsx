import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OnceMessagesApi } from '../api/generated/apis/OnceMessagesApi';
import { Configuration } from './apiConfiguration';

export const ONCE_ROUTE = '/today/only-you';
export const ONCE_CREATE_ROUTE = `${ONCE_ROUTE}/new`;
export const onceMessagePath = (id: string) =>
  `${ONCE_ROUTE}/${encodeURIComponent(id)}`;

export interface OnceEnvironment {
  api: OnceMessagesApi;
  accountId: string;
  spaceId: string;
  scope: string;
}

export const OnceMessagesContext = createContext<OnceEnvironment | null>(null);
export const useOnceEnvironment = () => useContext(OnceMessagesContext);

export function OnceMessagesProvider({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  children,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      api: new OnceMessagesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
      accountId,
      spaceId,
      scope: JSON.stringify([apiBaseUrl, accountId, spaceId]),
    }),
    [apiBaseUrl, accessToken, accountId, spaceId],
  );
  return (
    <OnceMessagesContext.Provider value={value}>
      {children}
    </OnceMessagesContext.Provider>
  );
}

export function useOnceStatus(environment: OnceEnvironment) {
  return useQuery({
    queryKey: ['once-status', environment.scope],
    queryFn: ({ signal }) =>
      environment.api.getOnceMessageStatus(
        { spaceId: environment.spaceId },
        { signal, cache: 'no-store' },
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useOnceInbox(environment: OnceEnvironment, enabled = true) {
  return useQuery({
    queryKey: ['once-inbox', environment.scope],
    queryFn: ({ signal }) =>
      environment.api.listOnceMessages(
        { spaceId: environment.spaceId },
        { signal, cache: 'no-store' },
      ),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 20_000,
  });
}
