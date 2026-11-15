/**
 * Strict reader for the canonical legal documents in `legal/`.
 *
 * The documents deliberately use a small Markdown subset: front matter, one
 * title, section headings, paragraphs, ordered and bulleted lists with one
 * nested bullet level, bold text, safe links and `[[PLACEHOLDER]]` markers.
 * Anything else is rejected instead of being rendered approximately, so the
 * text people accept is exactly the text that was reviewed.
 */

export class LegalMarkdownError extends Error {}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;
const REQUIRED_KEYS = ['document', 'locale', 'version', 'status'];
const STATUSES = new Set(['draft', 'published']);
const ORDERED_ITEM = /^(\d+)\. (.+)$/;
const NESTED_ITEM = /^ {3}- (.+)$/;
const BULLET_ITEM = /^- (.+)$/;
const PLACEHOLDER = /\[\[([A-Z][A-Z0-9_]*)\]\]/;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/;

function fail(lineNumber, message) {
  throw new LegalMarkdownError(`Line ${lineNumber}: ${message}`);
}

function parseFrontMatter(source) {
  const match = FRONT_MATTER.exec(source);
  if (!match) throw new LegalMarkdownError('Missing front matter.');
  const metadata = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 1)
      throw new LegalMarkdownError(`Invalid front matter: ${line}`);
    metadata[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim();
  }
  for (const key of REQUIRED_KEYS) {
    if (!metadata[key])
      throw new LegalMarkdownError(`Missing front matter key: ${key}`);
  }
  if (!STATUSES.has(metadata.status)) {
    throw new LegalMarkdownError(`Unknown status: ${metadata.status}`);
  }
  return {
    metadata,
    body: source.slice(match[0].length),
    bodyLine: match[0].split('\n').length,
  };
}

function safeHref(href, lineNumber) {
  if (/^https:\/\/[^\s]+$/.test(href) || /^\/(?!\/)[^\s]*$/.test(href))
    return href;
  return fail(lineNumber, `Unsupported link target: ${href}`);
}

/** Split text into plain, strong, link and placeholder runs. */
export function parseInline(text, lineNumber = 0) {
  if (/[<>`]|!\[|(^|\s)_[^_]|\*(?!\*)/.test(text.replaceAll('**', ''))) {
    fail(lineNumber, `Unsupported inline syntax: ${text}`);
  }
  const runs = [];
  const segments = text.split('**');
  if (segments.length % 2 === 0) fail(lineNumber, 'Unclosed bold text.');
  segments.forEach((segment, index) => {
    const strong = index % 2 === 1;
    let rest = segment;
    while (rest) {
      const placeholder = PLACEHOLDER.exec(rest);
      const link = LINK.exec(rest);
      const next = [placeholder, link]
        .filter(Boolean)
        .sort((left, right) => left.index - right.index)[0];
      if (!next) {
        runs.push({ kind: strong ? 'strong' : 'text', text: rest });
        break;
      }
      if (next.index > 0) {
        runs.push({
          kind: strong ? 'strong' : 'text',
          text: rest.slice(0, next.index),
        });
      }
      if (next === placeholder) {
        runs.push({ kind: 'placeholder', name: placeholder[1] });
      } else {
        runs.push({
          kind: 'link',
          text: link[1],
          href: safeHref(link[2], lineNumber),
        });
      }
      rest = rest.slice(next.index + next[0].length);
    }
  });
  if (runs.some((run) => run.kind === 'text' && /\[\[|\]\]/.test(run.text))) {
    fail(lineNumber, 'Malformed placeholder.');
  }
  return runs;
}

function slug(text, used) {
  const base =
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/§/g, 'paragraph')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
  let candidate = base;
  for (let index = 2; used.has(candidate); index += 1) {
    candidate = `${base}-${index}`;
  }
  used.add(candidate);
  return candidate;
}

/** Parse one canonical legal document into its metadata and typed blocks. */
export function parseLegalMarkdown(source) {
  if (source.includes('\r'))
    throw new LegalMarkdownError('Use LF line endings.');
  const { metadata, body, bodyLine } = parseFrontMatter(source);
  const lines = body.split('\n');
  const blocks = [];
  const anchors = new Set();
  let title = null;
  let paragraph = null;
  let list = null;

  const closeParagraph = () => {
    if (!paragraph) return;
    blocks.push({
      kind: 'paragraph',
      content: parseInline(paragraph.text, paragraph.line),
    });
    paragraph = null;
  };
  const closeList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  lines.forEach((line, offset) => {
    const lineNumber = bodyLine + offset;
    if (/\s$/.test(line)) fail(lineNumber, 'Trailing whitespace.');
    if (line === '') {
      closeParagraph();
      closeList();
      return;
    }
    if (line.startsWith('# ')) {
      if (title !== null || blocks.length)
        fail(lineNumber, 'Only one leading title is allowed.');
      title = line.slice(2);
      parseInline(title, lineNumber);
      return;
    }
    if (line.startsWith('## ')) {
      closeParagraph();
      closeList();
      const text = line.slice(3);
      blocks.push({
        kind: 'heading',
        id: slug(text, anchors),
        content: parseInline(text, lineNumber),
      });
      return;
    }
    if (/^#{3,}/.test(line))
      fail(lineNumber, 'Only # and ## headings are allowed.');
    const nested = NESTED_ITEM.exec(line);
    if (nested) {
      const owner = list?.items.at(-1);
      if (!owner) fail(lineNumber, 'Nested item without a parent item.');
      owner.children.push(parseInline(nested[1], lineNumber));
      return;
    }
    const ordered = ORDERED_ITEM.exec(line);
    const bullet = ordered ? null : BULLET_ITEM.exec(line);
    if (ordered || bullet) {
      closeParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) closeList();
      if (!list) list = { kind: 'list', ordered: isOrdered, items: [] };
      if (isOrdered && Number(ordered[1]) !== list.items.length + 1) {
        fail(lineNumber, 'Ordered items must count up from 1.');
      }
      list.items.push({
        content: parseInline(isOrdered ? ordered[2] : bullet[1], lineNumber),
        children: [],
      });
      return;
    }
    if (/^\s/.test(line) || /^(\||>|```|\* |\+ )/.test(line)) {
      fail(lineNumber, `Unsupported block syntax: ${line}`);
    }
    closeList();
    if (paragraph) paragraph.text = `${paragraph.text} ${line}`;
    else paragraph = { text: line, line: lineNumber };
  });
  closeParagraph();
  closeList();

  if (title === null) throw new LegalMarkdownError('Missing title.');
  const placeholders = [
    ...new Set(
      [...source.matchAll(/\[\[([A-Z][A-Z0-9_]*)\]\]/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  if (metadata.status === 'published' && placeholders.length) {
    throw new LegalMarkdownError(
      `A published document has unresolved placeholders: ${placeholders.join(', ')}`,
    );
  }
  return {
    document: metadata.document,
    locale: metadata.locale,
    version: metadata.version,
    status: metadata.status,
    title,
    placeholders,
    blocks,
  };
}
