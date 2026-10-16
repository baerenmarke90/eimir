/** Read canonical Vite identity variables with a temporary legacy fallback. */
export function identityBuildVariable(name: string): string {
  const environment = import.meta.env as Record<string, string | undefined>;
  return (
    environment[`VITE_EIMIR_${name}`] ?? environment[`VITE_SBS_${name}`] ?? ''
  );
}
