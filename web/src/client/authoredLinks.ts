import { LinkifyIt } from 'linkify-it';

const detector = new LinkifyIt({
  fuzzyLink: true,
  fuzzyEmail: false,
  fuzzyIP: false,
  urlAuth: true,
  maxLength: 2048,
});

/** Detection is a library concern; navigation still has a closed scheme boundary. */
export function authoredLinks(text: string) {
  return (detector.match(text) ?? []).flatMap((match) => {
    try {
      const url = new URL(match.url);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return [];
      return [{ start: match.index, end: match.lastIndex, url: url.href }];
    } catch {
      return [];
    }
  });
}
