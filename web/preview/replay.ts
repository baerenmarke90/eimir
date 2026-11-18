/**
 * Read-only API replay for the eimir.de product preview.
 *
 * The preview runs the real Web app, but without a server: every request to
 * `/api/v1/` is answered from a recording of the public demo Space (fictional
 * data only, see docs/DEMO-SPACE.md). Anything that would write is refused.
 * Import this module before the app so it patches `fetch` first.
 */
import recording from './data/api.json';
import session from './data/session.json';

type Entry = {
  status: number;
  contentType: string;
  etag?: string;
  text?: string;
  file?: string;
};

const entries = recording as Record<string, Entry>;
const mediaFiles = import.meta.glob('./data/media/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const mediaByName = new Map(
  Object.entries(mediaFiles).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1),
    url,
  ]),
);
const mediaNames = [...mediaByName.keys()].sort();
const realFetch = window.fetch.bind(window);

const FAR_FUTURE = '2099-01-01T00:00:00.000Z';
const FAKE_TOKENS = {
  accessToken: 'preview',
  accessExpiresAt: FAR_FUTURE,
  refreshToken: 'preview',
  refreshExpiresAt: FAR_FUTURE,
};

/** Seed the signed-in state the app reads at start (sessionStorage only). */
export function seedPreviewSession(language: 'de' | 'en' = 'de'): void {
  window.sessionStorage.setItem(
    'eimir-session-v1',
    JSON.stringify({
      account: {
        ...session.account,
        languagePreference: language,
        locale: language,
      },
      tokens: FAKE_TOKENS,
      spaceId: session.spaceId,
    }),
  );
}

function problem(status: number, title: string, code: string): Response {
  return new Response(JSON.stringify({ status, title, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

function pathOf(url: URL): string {
  return url.pathname + url.search;
}

function findEntry(method: string, url: URL): Entry | undefined {
  const exact = entries[`${method} ${pathOf(url)}`];
  if (exact) return exact;
  const prefix = `${method} ${url.pathname}`;
  const key = Object.keys(entries).find(
    (candidate) => candidate === prefix || candidate.startsWith(`${prefix}?`),
  );
  return key ? entries[key] : undefined;
}

async function answer(entry: Entry): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': entry.contentType };
  if (entry.etag) headers.ETag = entry.etag;
  if (entry.file) {
    const url = mediaByName.get(entry.file);
    if (url) {
      const media = await realFetch(url);
      return new Response(await media.blob(), { status: 200, headers });
    }
  }
  return new Response(entry.status === 204 ? null : (entry.text ?? ''), {
    status: entry.status,
    headers,
  });
}

/** Unknown photos still show a photo, picked by the attachment id. */
async function fallbackMedia(url: URL): Promise<Response> {
  let hash = 0;
  for (const char of url.pathname)
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const name = mediaNames[hash % mediaNames.length];
  const media = await realFetch(mediaByName.get(name) as string);
  return new Response(await media.blob(), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg' },
  });
}

async function handle(method: string, url: URL): Promise<Response> {
  const path = url.pathname;
  if (method === 'GET' || method === 'HEAD') {
    const entry = findEntry('GET', url);
    if (entry) return answer(entry);
    if (/\/attachments\/[^/]+\/content$/.test(path)) return fallbackMedia(url);
    return problem(404, 'Not part of the preview', 'PREVIEW_NOT_RECORDED');
  }
  if (/\/attachments\/[^/]+\/read-access$/.test(path)) {
    const variant = url.searchParams.get('variant');
    const contentUrl = `${path.replace(/read-access$/, 'content')}${
      variant ? `?variant=${variant}` : '?variant=thumbnail'
    }`;
    return new Response(
      JSON.stringify({
        mediaType: 'IMAGE',
        method: 'STREAM',
        url: contentUrl,
        expiresAt: null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (path.endsWith('/story-views')) return new Response(null, { status: 204 });
  if (path.endsWith('/auth/refresh')) {
    return new Response(
      JSON.stringify({ account: session.account, tokens: FAKE_TOKENS }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const stored = findEntry(method, url);
  if (stored) return answer(stored);
  return problem(403, 'The preview is read-only', 'PREVIEW_READ_ONLY');
}

window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url, window.location.href);
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith('/api/')
  ) {
    return realFetch(input, init);
  }
  return handle(request.method.toUpperCase(), url);
};
