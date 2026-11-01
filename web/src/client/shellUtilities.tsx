import { createContext, useContext } from 'react';

interface ShellUtilities {
  unreadCount?: number;
  serverAdmin: boolean;
  onLogout?: () => void;
}

/** Share the shell's authoritative count, capabilities and safe sign-out. */
export const ShellUtilitiesContext = createContext<ShellUtilities>({
  serverAdmin: false,
});

export function useShellUtilities(): ShellUtilities {
  return useContext(ShellUtilitiesContext);
}
