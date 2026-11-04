import { createContext, type ReactNode, useContext, useMemo } from 'react';

type ApiRuntime = {
  apiBaseUrl: string;
  accessToken: string;
  accountId?: string;
  spaceId?: string;
};

const ApiRuntimeContext = createContext<ApiRuntime | null>(null);

export function ApiRuntimeProvider({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  children,
}: ApiRuntime & { children: ReactNode }) {
  const value = useMemo(
    () => ({ apiBaseUrl, accessToken, accountId, spaceId }),
    [apiBaseUrl, accessToken, accountId, spaceId],
  );

  return (
    <ApiRuntimeContext.Provider value={value}>
      {children}
    </ApiRuntimeContext.Provider>
  );
}

export function useApiRuntime(): ApiRuntime | null {
  return useContext(ApiRuntimeContext);
}
