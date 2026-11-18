import {
  Capacitor,
  type PluginListenerHandle,
  registerPlugin,
} from '@capacitor/core';
import { authoredLinks } from './authoredLinks';

/** One pending hand-off held natively until the app accepts or discards it. */
export interface SharedWish {
  available: boolean;
  failed: boolean;
  generation: string;
  /** Shared text, for example a chat message that carries a link. */
  text: string | null;
  hasImage: boolean;
  imageCount: number;
}

export const nativeWishShare = registerPlugin<{
  peek(): Promise<SharedWish>;
  read(options: {
    generation: string;
  }): Promise<{ uri: string; mimeType: string }>;
  discard(options?: { generation?: string }): Promise<void>;
  share(options: { url: string; title?: string }): Promise<{ shared: boolean }>;
  addListener(
    event: 'wishShared',
    callback: () => void,
  ): Promise<PluginListenerHandle>;
}>('WishShare');

/** Matches the existing attachment photo limit used by the photo sources. */
export const SHARED_WISH_PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const SHARED_WISH_TITLE_MAX = 200;
export const SHARED_WISH_DESCRIPTION_MAX = 4000;
export const SHARED_WISH_LINK_MAX = 2048;
const SHARED_TEXT_INPUT_MAX = 50_000;

const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const SELECTED_MEDIA_URI =
  /^content:\/\/de\.eimir\.app(?:\.debug)?\.selectedmedia\/[a-f0-9-]+$/;

/** Reads the leased shared photo; the caller discards the lease afterwards. */
export async function readSharedWishImage(
  generation: string,
  signal: AbortSignal,
): Promise<File> {
  const result = await nativeWishShare.read({ generation });
  if (!SELECTED_MEDIA_URI.test(result.uri))
    throw new Error('Invalid photo selection');
  const mimeType = result.mimeType.split(';')[0].trim().toLowerCase();
  const extension = PHOTO_EXTENSIONS[mimeType];
  if (!extension) throw new Error('Unsupported photo type');
  const response = await fetch(Capacitor.convertFileSrc(result.uri), {
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error('Photo selection unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted)
        throw new DOMException('Import aborted', 'AbortError');
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > SHARED_WISH_PHOTO_MAX_BYTES)
        throw new Error('Photo selection exceeds limit');
      chunks.push(new Uint8Array(chunk.value));
    }
    if (bytes === 0) throw new Error('Photo selection is empty');
    return new File(chunks, `shared-photo.${extension}`, { type: mimeType });
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export interface SharedWishContent {
  title?: string;
  description?: string;
  linkUrl?: string;
}

/** Invisible and bidirectional controls that chat apps add around text. */
function isIgnorableCodePoint(codePoint: number): boolean {
  return (
    (codePoint < 0x20 && codePoint !== 0x0a && codePoint !== 0x09) ||
    codePoint === 0x7f ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

function cleanSharedText(text: string): string {
  let result = '';
  for (const character of text.replace(/\r\n?/g, '\n')) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (!isIgnorableCodePoint(codePoint)) result += character;
  }
  return result;
}

/** Truncates by code point so an emoji is never cut in half. */
function truncate(value: string, maximum: number): string {
  const points = Array.from(value);
  return points.length <= maximum
    ? value
    : points.slice(0, maximum).join('').trimEnd();
}

const TRAILING_PUNCTUATION = /[.,;:!?'"»”’…]+$/;

/** Removes sentence punctuation (and unbalanced closing brackets) after a link. */
function stripTrailingPunctuation(raw: string): string {
  let value = raw;
  for (;;) {
    const before = value;
    value = value.replace(TRAILING_PUNCTUATION, '');
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ]) {
      if (value.endsWith(close)) {
        const opens = value.split(open).length - 1;
        const closes = value.split(close).length - 1;
        if (closes > opens) value = value.slice(0, -1);
      }
    }
    if (value === before) return value;
  }
}

function safeLink(raw: string): string | undefined {
  const stripped = stripTrailingPunctuation(raw);
  if (!stripped) return undefined;
  try {
    const url = new URL(
      /^https?:\/\//i.test(stripped) ? stripped : `https://${stripped}`,
    );
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.href.length > SHARED_WISH_LINK_MAX
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * Splits a shared message into a Wish suggestion. The first safe web link
 * becomes the link; the remaining text becomes the title (first line) and
 * description (the rest). A link-only share gets no title: the editor asks.
 */
export function extractSharedWishContent(
  rawText: string | null | undefined,
): SharedWishContent {
  const text = cleanSharedText((rawText ?? '').slice(0, SHARED_TEXT_INPUT_MAX));
  let linkUrl: string | undefined;
  let remaining = text;
  for (const found of authoredLinks(text)) {
    const url = safeLink(text.slice(found.start, found.end));
    if (!url) continue;
    linkUrl = url;
    remaining = `${text.slice(0, found.start)}${text.slice(found.end)}`;
    break;
  }
  const lines = remaining
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]+/g, ' ')
        // Brackets that only held the removed link, and the gap it left
        // before sentence punctuation.
        .replace(/\(\s*\)|\[\s*\]/g, '')
        .replace(/ +([.,;:!?])/g, '$1')
        .trim(),
    )
    // A line that was only punctuation around the link carries no content.
    .filter((line) => !/^[\p{P}\s]+$/u.test(line));
  const body = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const content: SharedWishContent = {};
  if (linkUrl) content.linkUrl = linkUrl;
  if (!body) return content;
  const [first, ...rest] = body.split('\n');
  if (Array.from(first).length <= SHARED_WISH_TITLE_MAX) {
    content.title = first;
    const description = rest.join('\n').trim();
    if (description)
      content.description = truncate(description, SHARED_WISH_DESCRIPTION_MAX);
  } else {
    content.title = truncate(first, SHARED_WISH_TITLE_MAX);
    content.description = truncate(body, SHARED_WISH_DESCRIPTION_MAX);
  }
  return content;
}
