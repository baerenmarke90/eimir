import { describe, expect, it } from 'vitest';

type NodeFs = {
  readFileSync(path: URL, encoding: 'utf8'): string;
};

type NodeProcess = {
  getBuiltinModule(name: 'fs'): NodeFs;
};

function readThemeCss(): string {
  const processRef = (
    globalThis as typeof globalThis & { process?: NodeProcess }
  ).process;
  if (!processRef)
    throw new Error('Node process API is unavailable in the test run.');
  return processRef
    .getBuiltinModule('fs')
    .readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
}

describe('responsive theme controls', () => {
  it('collapses authenticated header controls through the medium layout range', () => {
    const css = readThemeCss();
    const mediumQuery = '@media (min-width: 600px) and (max-width: 839px)';
    const start = css.indexOf(mediumQuery);

    expect(start).toBeGreaterThanOrEqual(0);

    const mediumRules = css.slice(start);
    expect(mediumRules).toContain('.app-header .brand-name');
    expect(mediumRules).toContain('.app-header .shared-context');
    expect(mediumRules).toContain('.app-header .theme-control-inline label');
    expect(mediumRules).toContain('.app-header .theme-control-icon');
    expect(mediumRules).toContain('.app-header .theme-control-inline select');
  });
});
