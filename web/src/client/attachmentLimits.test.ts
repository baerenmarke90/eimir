import { describe, expect, it } from 'vitest';
import { MAX_MEMORY_ATTACHMENTS } from './attachmentLimits';

type NodeFs = {
  readFileSync(path: URL, encoding: 'utf8'): string;
};

type NodeProcess = {
  getBuiltinModule(name: 'fs'): NodeFs;
};

function readSource(relativePath: string): string {
  const processRef = (
    globalThis as typeof globalThis & { process?: NodeProcess }
  ).process;
  if (!processRef)
    throw new Error('Node process API is unavailable in the test run.');
  return processRef
    .getBuiltinModule('fs')
    .readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('MAX_MEMORY_ATTACHMENTS parity with the backend (#701)', () => {
  it('matches MAX_MEMORY_ATTACHMENTS in backend/src/eimir/attachments/binding.py', () => {
    const backendSource = readSource(
      '../../../backend/src/eimir/attachments/binding.py',
    );
    const match = backendSource.match(/^MAX_MEMORY_ATTACHMENTS = (\d+)$/m);
    if (!match)
      throw new Error(
        'Could not find MAX_MEMORY_ATTACHMENTS in binding.py; update the parity regex if it moved.',
      );
    const backendValue = Number(match[1]);
    expect(MAX_MEMORY_ATTACHMENTS).toBe(backendValue);
  });
});
