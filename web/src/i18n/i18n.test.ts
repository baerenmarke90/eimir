import { parseSync } from 'rolldown/utils';
import { DEFAULT_LOCALE, i18n, resolvedLocale } from './index';
import de from './locales/de';

const sourceFiles = import.meta.glob(
  [
    '../**/*.ts',
    '../**/*.tsx',
    '!../**/*.test.ts',
    '!../**/*.test.tsx',
    '!../api/generated/**',
  ],
  { eager: true, import: 'default', query: '?raw' },
) as Record<string, string>;

interface AstNode {
  type: string;
  start: number;
  [property: string]: unknown;
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function staticKey(node: AstNode): string | undefined {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  // A template literal without substitutions is a static key as well.
  if (node.type === 'TemplateLiteral') {
    const expressions = node.expressions as unknown[];
    const quasis = node.quasis as Array<{ value: { cooked: string | null } }>;
    if (expressions.length === 0 && quasis.length === 1) {
      return quasis[0].value.cooked ?? undefined;
    }
  }
  return undefined;
}

function isTranslationCallee(callee: AstNode): boolean {
  if (callee.type === 'Identifier') {
    return callee.name === 't';
  }
  if (callee.type !== 'MemberExpression' || callee.computed === true) {
    return false;
  }
  const object = callee.object as AstNode;
  const property = callee.property as AstNode;
  return (
    object.type === 'Identifier' &&
    object.name === 'i18n' &&
    property.type === 'Identifier' &&
    property.name === 't'
  );
}

function collectStaticTranslationKeys(
  fileName: string,
  source: string,
): Array<{ key: string; fileName: string; line: number }> {
  // oxc (bundled with Vite's rolldown) parses TS/TSX without the TypeScript
  // compiler API, which TypeScript 7 no longer ships.
  const { program, errors } = parseSync(fileName, source);
  if (errors.length > 0) {
    throw new Error(`${fileName}: ${errors[0].message}`);
  }
  const keys: Array<{ key: string; fileName: string; line: number }> = [];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isAstNode(value)) {
      return;
    }
    if (value.type === 'CallExpression') {
      const args = value.arguments as AstNode[];
      const key = args.length > 0 ? staticKey(args[0]) : undefined;
      if (key !== undefined && isTranslationCallee(value.callee as AstNode)) {
        const line = source.slice(0, args[0].start).split('\n').length;
        keys.push({ key, fileName, line });
      }
    }
    for (const child of Object.values(value)) {
      if (typeof child === 'object' && child !== null) {
        visit(child);
      }
    }
  }

  visit(program);
  return keys;
}

function flattenResourceKeys(
  value: unknown,
  prefix = '',
  keys = new Set<string>(),
): Set<string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [segment, child] of Object.entries(value)) {
      flattenResourceKeys(
        child,
        prefix ? `${prefix}.${segment}` : segment,
        keys,
      );
    }
  } else if (prefix) {
    keys.add(prefix);
  }
  return keys;
}

describe('web i18n', () => {
  it('starts with German as the default locale', () => {
    expect(DEFAULT_LOCALE).toBe('de');
    expect(resolvedLocale()).toBe('de');
    expect(i18n.t('story.kind.memory')).toBe('Erinnerung');
  });

  it('resolves shared edit and saving copy', () => {
    expect(i18n.t('common.edit')).toBe(de.common.edit);
    expect(i18n.t('common.saving')).toBe(de.common.saving);
  });

  it('uses locale plural rules for photo counts', () => {
    expect(i18n.t('story.photos', { count: 1 })).toBe('1 Foto');
    expect(i18n.t('story.photos', { count: 2 })).toBe('2 Fotos');
  });

  it('collects literal translation calls without treating dynamic keys as static', () => {
    const keys = collectStaticTranslationKeys(
      'sample.tsx',
      `t('common.edit'); t(\`m5s3.plan.status.\${status}\`); i18n.t('common.saving');`,
    ).map(({ key }) => key);

    expect(keys).toEqual(['common.edit', 'common.saving']);
  });

  it('defines every statically referenced translation key', () => {
    const resourceKeys = flattenResourceKeys(
      i18n.getResourceBundle(DEFAULT_LOCALE, 'translation'),
    );
    const missing = Object.entries(sourceFiles)
      .flatMap(([fileName, source]) =>
        collectStaticTranslationKeys(fileName, source),
      )
      .filter(
        ({ key }) =>
          !resourceKeys.has(key) &&
          !Array.from(resourceKeys).some((candidate) =>
            candidate.startsWith(`${key}_`),
          ),
      )
      .map(({ key, fileName, line }) => `${fileName}:${line} -> ${key}`)
      .sort();

    expect(missing).toEqual([]);
  });

  it('falls back to German resources for an unsupported language request', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('story.kind.memory')).toBe('Erinnerung');
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});
