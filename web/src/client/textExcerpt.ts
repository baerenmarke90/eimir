/** Bound overview prose for sighted and assistive readers without changing detail. */
export function textExcerpt(text: string, limit = 180): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const segments =
    typeof Intl.Segmenter === 'function'
      ? Array.from(
          new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
            normalized,
          ),
          ({ segment }) => segment,
        )
      : Array.from(normalized);
  if (segments.length <= limit) return normalized;
  return `${segments.slice(0, limit).join('').trimEnd()}…`;
}
