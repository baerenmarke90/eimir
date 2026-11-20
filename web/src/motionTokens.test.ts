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
      for (const declaration of motionDeclarations(css)) {
        if (RAW_MOTION_VALUE.test(declaration)) {
          offenders.push(`${path}: ${declaration}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('runs the media gallery loading pulse on the motion layer (#2079)', () => {
    // The last raw-timing loop: the gallery placeholder now uses the Loading
    // utility, which reads token roles and is absent with reduced motion.
    const css = productionStylesheets['./components/MediaGallery.css'];
    const utilities = productionStylesheets['./motion/utilities.css'];

    expect(css).not.toContain('gallery-pulse');
    expect(productionSources['./components/MediaGallery.tsx']).toContain(
      'eimir-motion-loading-pulse',
    );
    expect(utilities).toContain('.eimir-motion-loading-pulse');
    expect(utilities).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps Daily Quote on defined canonical duration roles', () => {
    const css = productionStylesheets['./components/DailyQuoteCard.css'];

    expect(css).toContain('var(--duration-transition)');
    expect(css).toContain('var(--duration-feedback)');
    expect(css).not.toContain('--duration-standard');
    expect(css).not.toContain('--duration-fast');
  });

  it('keeps Daily Quote text legible throughout its entrance motion', () => {
    // The card uses the motion layer's translate-only Enter `shift` (#2074).
    const css = productionStylesheets['./components/DailyQuoteCard.css'];
    expect(normalizeWhitespace(css)).toContain(
      'animation: eimir-motion-enter-shift var(--duration-transition)',
    );
    const catalogue = productionStylesheets['./motion/motion.css'];
    const reveal = catalogue.match(
      /@keyframes eimir-motion-enter-shift\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(reveal).toContain('translate:');
    expect(reveal).not.toMatch(/\bopacity\s*:/);
  });
});
