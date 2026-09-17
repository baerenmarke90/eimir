import { createContext, type ReactNode, useContext } from 'react';

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
  return (
    <ApiRuntimeContext.Provider value={{ apiBaseUrl, accessToken }}>
      {children}
    </ApiRuntimeContext.Provider>
  );
}

export function useApiRuntime(): ApiRuntime | null {
  return useContext(ApiRuntimeContext);
}
