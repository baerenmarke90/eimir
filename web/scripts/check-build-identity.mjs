import { assertBuildIdentity, BuildIdentityError } from './build-identity.mjs';

try {
  assertBuildIdentity(process.env);
} catch (error) {
  if (error instanceof BuildIdentityError) {
    console.error(`\nERROR: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
