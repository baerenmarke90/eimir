import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CapacitorBuildConfigurationError,
  resolveCapacitorBuildEnvironment,
} from './capacitor-build-environment.mjs';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

let resolved;
try {
  resolved = resolveCapacitorBuildEnvironment(process.env);
} catch (error) {
  if (error instanceof CapacitorBuildConfigurationError) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

console.log(
  `Building Web bundle for Capacitor with API base: ${resolved.apiBaseUrl}${resolved.demoMode ? ' (demo mode enabled)' : ''}`,
);
execSync('npm run build', {
  cwd: webRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...resolved.buildEnv,
  },
});
