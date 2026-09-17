import { createContext, type ReactNode, useContext, useMemo } from 'react';

type ApiRuntime = {
  apiBaseUrl: string;
  accessToken: string;
};

const ApiRuntimeContext = createContext<ApiRuntime | null>(null);

export function ApiRuntimeProvider({
  apiBaseUrl,
  accessToken,
  children,
}: ApiRuntime & { children: ReactNode }) {
  const value = useMemo(
    () => ({ apiBaseUrl, accessToken }),
    [apiBaseUrl, accessToken],
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
