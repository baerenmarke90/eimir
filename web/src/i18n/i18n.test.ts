import { parseSync } from 'rolldown/utils';
import { DEFAULT_LOCALE, i18n, resolvedLocale } from './index';
import de from './locales/de';
import { localeRegistry, supportedLocales } from './resources';

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

const recipientPacks = import.meta.glob(
  '../../../backend/src/eimir/i18n/locales/*.json',
  { eager: true, import: 'default', query: '?raw' },
);

const nativePacks = import.meta.glob(
  '../../../android/app/src/main/res/values*/strings.xml',
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

function resourceEntries(
  value: unknown,
  prefix = '',
  result = new Map<string, string>(),
) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      resourceEntries(child, prefix ? `${prefix}.${key}` : key, result);
    }
  } else if (typeof value === 'string') result.set(prefix, value);
  return result;
}

const pluralSuffix = /_(zero|one|two|few|many|other)$/u;
function placeholders(value: string) {
  return [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/gu)]
    .map((match) => match[1])
    .sort();
}

describe('web i18n', () => {
  it('registers the same product languages for Web, recipient delivery and native fallback', () => {
    const recipientLocales = Object.keys(recipientPacks)
      .map((file) =>
        file
          .split('/')
          .at(-1)
          ?.replace(/\.json$/u, ''),
      )
      .sort();
    const nativeLocales = Object.values(nativePacks)
      .map(
        (xml) =>
          xml.match(/<string name="product_locale">([^<]+)<\/string>/u)?.[1],
      )
      .filter(Boolean)
      .sort();
    expect(recipientLocales).toEqual([...supportedLocales].sort());
    expect(nativeLocales).toEqual([...supportedLocales].sort());
  });

  it('bundles complete packs with matching interpolation and native plural categories', () => {
    const baseline = resourceEntries(localeRegistry.de.translation);
    const expected = new Set(
      [...baseline.keys()].map((key) => key.replace(pluralSuffix, '')),
    );
    for (const locale of supportedLocales) {
      const entries = resourceEntries(localeRegistry[locale].translation);
      const actual = new Set(
        [...entries.keys()].map((key) => key.replace(pluralSuffix, '')),
      );
      expect([...actual].sort(), locale).toEqual([...expected].sort());
      const categories = new Intl.PluralRules(locale).resolvedOptions()
        .pluralCategories;
      const groups = new Set(
        [...baseline.keys()]
          .filter((key) => pluralSuffix.test(key))
          .map((key) => key.replace(pluralSuffix, '')),
      );
      for (const group of groups) {
        for (const category of categories) {
          expect(
            entries.has(`${group}_${category}`),
            `${locale}:${group}_${category}`,
          ).toBe(true);
        }
      }
      for (const [key, value] of entries) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
        const original =
          baseline.get(key) ??
          baseline.get(key.replace(pluralSuffix, '_other'));
        expect(original, `${locale}:${key}`).toBeDefined();
        expect(placeholders(value), `${locale}:${key}`).toEqual(
          placeholders(original ?? ''),
        );
        expect(
          value.replace(/\{\{[^{}]+\}\}/gu, ''),
          `${locale}:${key}`,
        ).not.toMatch(/\{\{|\}\}/u);
        if (
          locale === 'en' &&
          [
            'common.cancel',
            'common.saving',
            'common.edit',
            'navigation.settings',
            'navigation.story',
            'languageSettings.personal',
          ].includes(key)
        )
          expect(value, key).not.toBe(original);
      }
    }
  });

  it('keeps visible JSX text and accessible names in language resources', () => {
    const exceptions = new Set(['eimir', '© OpenStreetMap']);
    const findings: string[] = [];
    for (const [fileName, source] of Object.entries(sourceFiles)) {
      if (!fileName.endsWith('.tsx')) continue;
      const { program } = parseSync(fileName, source);
      function visit(node: unknown): void {
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (!isAstNode(node)) return;
        let copy: unknown;
        if (node.type === 'JSXText') copy = node.value;
        if (node.type === 'JSXAttribute') {
          const name = (node.name as AstNode).name;
          const value = node.value as AstNode | undefined;
          if (
            ['aria-label', 'title', 'placeholder', 'alt'].includes(String(name))
          ) {
            copy = value?.type === 'Literal' ? value.value : undefined;
          }
        }
        if (
          typeof copy === 'string' &&
          /[A-Za-z]{2}/u.test(copy) &&
          !exceptions.has(copy.trim())
        ) {
          findings.push(
            `${fileName}:${source.slice(0, node.start).split('\n').length}: ${copy.trim()}`,
          );
        }
        for (const child of Object.values(node))
          if (typeof child === 'object' && child !== null) visit(child);
      }
      visit(program);
    }
    expect(findings).toEqual([]);
  });

  it('renders English and changes document language without restarting i18next', async () => {
    await i18n.changeLanguage('en-US');
    expect(resolvedLocale()).toBe('en');
    expect(i18n.t('story.kind.memory')).toBe('Memory');
    expect(i18n.t('story.photos', { count: 1 })).toBe('1 photo');
    expect(i18n.t('story.photos', { count: 2 })).toBe('2 photos');
    expect(i18n.t('photoSources.limit', { count: 1 })).toBe(
      'You can add 1 more photo.',
    );
    await i18n.changeLanguage('de');
  });
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
    await i18n.changeLanguage('fr');
    expect(i18n.t('story.kind.memory')).toBe('Erinnerung');
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});
