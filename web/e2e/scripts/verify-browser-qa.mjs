import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyBrowserQa(environment) {
  const expected =
    environment.EVENT_NAME === 'pull_request'
      ? {
          PR_RESULT: 'success',
          PLAN_RESULT: 'success',
          CHANGED_RESULT:
            environment.HAS_SPECS === 'true' ? 'success' : 'skipped',
          FULL_RESULT: 'skipped',
        }
      : {
          PR_RESULT: 'skipped',
          PLAN_RESULT: 'skipped',
          CHANGED_RESULT: 'skipped',
          FULL_RESULT: 'success',
        };
  if (
    environment.EVENT_NAME === 'pull_request' &&
    !['true', 'false'].includes(environment.HAS_SPECS)
  ) {
    throw new Error(
      'Browser selection plan did not declare its additional work.',
    );
  }
  for (const [key, value] of Object.entries(expected)) {
    if (environment[key] !== value)
      throw new Error(
        `${key}: expected ${value}, received ${environment[key]}`,
      );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    verifyBrowserQa(process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
