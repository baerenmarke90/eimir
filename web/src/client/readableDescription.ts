import { authoredLinks } from './authoredLinks';
const HTML_CONTENT =
  /<\/?(?:a|p|div|br|span|strong|em|b|i|ul|ol|li|table|tr|td|h[1-6])\b/i;
const BLOCKS = new Set([
  'P',
  'DIV',
  'BR',
  'LI',
  'TR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
]);
const OMIT = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'MATH',
  'TEMPLATE',
]);

/** Read pasted rich text as inert words. Never attach parsed nodes to the document. */
export function readableDescription(text: string): string {
  if (!HTML_CONTENT.test(text) || typeof document === 'undefined') return text;
  // Template contents are inert: no scripts execute or embedded resources load.
  const template = document.createElement('template');
  template.innerHTML = text;
  function read(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    const element = node instanceof Element ? node : null;
    if (element && OMIT.has(element.tagName)) return '';
    let value = Array.from(node.childNodes, read).join('');
    if (element?.tagName === 'A') {
      try {
        const url = new URL(element.getAttribute('href') ?? '');
        if (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !value.includes(url.href)
        ) {
          value = value.trim() ? `${value} (${url.href})` : url.href;
        }
      } catch {
        /* A missing/relative/dangerous destination remains ordinary text. */
      }
    }
    return element && BLOCKS.has(element.tagName) ? `${value}\n` : value;
  }
  return read(template.content)
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Word-aware bounded prose, including unusually short lines and blank blocks. */
export function descriptionExcerpt(text: string): string {
  const lines = text.split(/\r?\n/);
  let prefix = lines.slice(0, 5).join('\n');
  if (prefix.length > 360) {
    prefix = prefix.slice(0, 360);
    const boundary = prefix.lastIndexOf(' ');
    if (boundary > 0) prefix = prefix.slice(0, boundary);
  }
  const crossing = authoredLinks(text).find(
    (link) => link.start < prefix.length && link.end > prefix.length,
  );
  if (crossing) {
    // Never turn a clipped URL into a different clickable destination.
    if (crossing.start === 0) return text;
    prefix = prefix.slice(0, crossing.start);
  }
  return prefix.length < text.length ? `${prefix.trimEnd()}…` : text;
}
