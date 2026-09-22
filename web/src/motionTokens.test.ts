import { describe, expect, it } from 'vitest';

const productionStylesheets = import.meta.glob(
  ['./**/*.css', '!./design/product-roles.css'],
  { eager: true, import: 'default', query: '?raw' },
) as Record<string, string>;

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
  [
    './components/ThinkingOfYouButton.css',
    'animation: heart-pulse 0.8s ease-in-out infinite alternate;',
  ],
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
});
