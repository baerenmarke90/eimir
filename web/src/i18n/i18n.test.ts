import ts from 'typescript';
import de from './locales/de';
import { DEFAULT_LOCALE, i18n, resolvedLocale } from './index';

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

function collectStaticTranslationKeys(
  fileName: string,
  source: string,
): Array<{ key: string; fileName: string; line: number }> {
  const scriptKind = fileName.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const keys: Array<{ key: string; fileName: string; line: number }> = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isTranslationCall =
        (ts.isIdentifier(node.expression) && node.expression.text === 't') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'i18n' &&
          node.expression.name.text === 't');
      const firstArgument = node.arguments[0];

      if (
        isTranslationCall &&
        (ts.isStringLiteral(firstArgument) ||
          ts.isNoSubstitutionTemplateLiteral(firstArgument))
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          firstArgument.getStart(sourceFile),
        );
        keys.push({ key: firstArgument.text, fileName, line: line + 1 });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
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
