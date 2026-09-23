import { describe, expect, it } from 'vitest';

type NodeDirent = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
};

type NodeFs = {
  readdirSync(path: URL, options: { withFileTypes: true }): NodeDirent[];
  readFileSync(path: URL, encoding: 'utf8'): string;
};

type NodeProcess = {
  getBuiltinModule(name: 'fs'): NodeFs;
};

function readProductionSources(): Record<string, string> {
  const processRef = (
    globalThis as typeof globalThis & { process?: NodeProcess }
  ).process;
  if (!processRef) throw new Error('Node process API is unavailable.');

  const fs = processRef.getBuiltinModule('fs');
  const sources: Record<string, string> = {};

  function visit(directory: URL, prefix: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        visit(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`);
        continue;
      }
      if (!entry.isFile() || !/\.(?:css|ts|tsx)$/.test(entry.name)) continue;
      if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) continue;

      const path = `${prefix}${entry.name}`;
      sources[path] = fs.readFileSync(new URL(entry.name, directory), 'utf8');
    }
  }

  visit(new URL('./', import.meta.url), './');
  return sources;
}

const productionSources = readProductionSources();
const productionStylesheets = Object.fromEntries(
  Object.entries(productionSources).filter(
    ([path]) => path.endsWith('.css') && path !== './design/product-roles.css',
  ),
);

const LEGACY_MOTION_ROLE =
  /--motion-fast\b|--motion-duration-|--motion-easing-|--duration-fast\b|--duration-standard\b/;

const RAW_MOTION_VALUE =
  /\b\d+(?:\.\d+)?(?:ms|s)\b|\bease(?:-in|-out|-in-out)?\b|\blinear\b/;

const allowedContinuousLoops = new Map<string, string>([
  ['./styles.css', 'animation: story-shimmer 1.6s linear infinite;'],
  ['./story-media.css', 'animation: story-shimmer 1.6s linear infinite;'],
  [
    './components/MediaGallery.css',
    'animation: gallery-pulse 1.4s ease-in-out infinite;',
  ],
  ['./shell.css', 'animation: app-pull-refresh-spin 0.8s linear infinite;'],
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function motionDeclarations(css: string): string[] {
  const normalized = normalizeWhitespace(css);
  return (
    normalized.match(
      /(?:animation(?:-[a-z-]+)?|transition(?:-[a-z-]+)?)\s*:[^;]+;/gi,
    ) ?? []
  );
}

describe('canonical Web motion roles', () => {
  it('keeps the retired generic mount reveal out of production source', () => {
    const genericReveal = /\beimir-motion-reveal\b|\beimir-reveal\b/;
    const offenders = Object.entries(productionSources)
      .filter(([, source]) => genericReveal.test(source))
      .map(([path]) => path)
      .sort();

    expect(offenders).toEqual([]);
    expect(productionSources['./components/TodayPage.tsx']).not.toContain(
      'animationDelay',
    );
  });

  it('keeps retired motion aliases out of production stylesheets', () => {
    const offenders = Object.entries(productionStylesheets)
      .filter(([, css]) => LEGACY_MOTION_ROLE.test(css))
      .map(([path]) => path)
      .sort();

    expect(offenders).toEqual([]);
  });

  it('keeps interaction timing and easing on generated semantic roles', () => {
    const offenders: string[] = [];

    for (const [path, css] of Object.entries(productionStylesheets)) {
      const allowedLoop = allowedContinuousLoops.get(path);

      for (const declaration of motionDeclarations(css)) {
        if (allowedLoop && declaration === allowedLoop) continue;
        if (RAW_MOTION_VALUE.test(declaration)) {
          offenders.push(`${path}: ${declaration}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('limits raw timing exceptions to continuous status/loading loops with reduced-motion fallbacks', () => {
    for (const [path, declaration] of allowedContinuousLoops) {
      const css = productionStylesheets[path];

      expect(css, `Missing stylesheet: ${path}`).toBeDefined();
      expect(motionDeclarations(css)).toContain(declaration);
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('animation: none');
    }
  });

  it('keeps Daily Quote on defined canonical duration roles', () => {
    const css = productionStylesheets['./components/DailyQuoteCard.css'];

    expect(css).toContain('var(--duration-transition)');
    expect(css).toContain('var(--duration-feedback)');
    expect(css).not.toContain('--duration-standard');
    expect(css).not.toContain('--duration-fast');
  });

  it('keeps Daily Quote text legible throughout its entrance motion', () => {
    const css = productionStylesheets['./components/DailyQuoteCard.css'];
    const reveal = css.match(
      /@keyframes daily-quote-reveal\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(reveal).toContain('transform:');
    expect(reveal).not.toMatch(/\bopacity\s*:/);
  });
});
