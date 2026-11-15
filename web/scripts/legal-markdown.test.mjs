import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LegalMarkdownError, parseLegalMarkdown } from './legal-markdown.mjs';

const FRONT_MATTER = [
  '---',
  'document: terms-of-use',
  'locale: de-DE',
  'version: test-1',
  'status: draft',
  '---',
  '',
].join('\n');

function parse(body, frontMatter = FRONT_MATTER) {
  return parseLegalMarkdown(`${frontMatter}${body}`);
}

describe('parseLegalMarkdown', () => {
  it('reads the canonical terms of use without loss', () => {
    const source = readFileSync(
      new URL('../../legal/de/terms-of-use.md', import.meta.url),
      'utf8',
    );
    const parsed = parseLegalMarkdown(source);

    expect(parsed.document).toBe('terms-of-use');
    expect(parsed.locale).toBe('de-DE');
    expect(parsed.title).toBe('Nutzungsbedingungen für eimir.');
    const headings = parsed.blocks.filter((block) => block.kind === 'heading');
    expect(headings).toHaveLength(19);
    expect(headings.at(-1).id).toBe('paragraph-18-schlussbestimmungen');
    expect(parsed.placeholders).toContain('PROVIDER_NAME');
  });

  it('keeps headings, numbered items, nested bullets and inline runs', () => {
    const parsed = parse(
      [
        '# Titel',
        '',
        '## § 1 Erster Teil',
        '',
        '1. Erster Absatz mit **fett** und [[CONTACT_EMAIL]].',
        '2. Zweiter Absatz:',
        '   - eins',
        '   - [Link](https://example.org/terms)',
        '',
      ].join('\n'),
    );

    expect(parsed.blocks).toEqual([
      {
        kind: 'heading',
        id: 'paragraph-1-erster-teil',
        content: [{ kind: 'text', text: '§ 1 Erster Teil' }],
      },
      {
        kind: 'list',
        ordered: true,
        items: [
          {
            content: [
              { kind: 'text', text: 'Erster Absatz mit ' },
              { kind: 'strong', text: 'fett' },
              { kind: 'text', text: ' und ' },
              { kind: 'placeholder', name: 'CONTACT_EMAIL' },
              { kind: 'text', text: '.' },
            ],
            children: [],
          },
          {
            content: [{ kind: 'text', text: 'Zweiter Absatz:' }],
            children: [
              [{ kind: 'text', text: 'eins' }],
              [
                {
                  kind: 'link',
                  text: 'Link',
                  href: 'https://example.org/terms',
                },
              ],
            ],
          },
        ],
      },
    ]);
  });

  it.each([
    ['raw HTML', '# T\n\n<b>fett</b>\n'],
    ['third-level headings', '# T\n\n### Tief\n'],
    ['tables', '# T\n\n| a | b |\n'],
    ['images', '# T\n\n![Bild](https://example.org/a.png)\n'],
    ['unsafe link targets', '# T\n\n[x](javascript:alert(1))\n'],
    ['unclosed bold text', '# T\n\nNur **halb\n'],
    ['skipped numbering', '# T\n\n1. eins\n3. drei\n'],
    ['orphan nested bullets', '# T\n\n   - allein\n'],
    ['trailing whitespace', '# T\n\nText \n'],
  ])('rejects %s', (_, body) => {
    expect(() => parse(body)).toThrow(LegalMarkdownError);
  });

  it('refuses publication while placeholders remain', () => {
    expect(() =>
      parse(
        '# T\n\nKontakt: [[CONTACT_EMAIL]]\n',
        FRONT_MATTER.replace('status: draft', 'status: published'),
      ),
    ).toThrow(/unresolved placeholders: CONTACT_EMAIL/);
  });
});
