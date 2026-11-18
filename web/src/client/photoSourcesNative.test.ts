import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { PhotoSourcesApi } from '../api/generated/apis/PhotoSourcesApi';
import { Configuration } from '../api/generated/runtime';
import { readPhotoThumbnail } from './photoSources';

const bridgeSource = readFileSync(
  createRequire(import.meta.url).resolve(
    '@capacitor/android/capacitor/src/main/assets/native-bridge.js',
  ),
  'utf8',
);

// Exercise the installed bridge unchanged. Its native TEXT response models
// HttpRequestHandler's default for mutating fetch requests, not image parsing.
function nativeTransport(bytes: Uint8Array) {
  const native = vi.fn(async () => ({
    data: new TextDecoder().decode(bytes),
    headers: { 'Content-Type': 'image/jpeg' },
    status: 200,
    url: 'https://api.example.test/photo',
  }));
  const web = vi.fn(
    async () =>
      new Response(new Uint8Array(bytes), {
        headers: { 'Content-Type': 'image/jpeg' },
      }),
  );
  class Document {}
  class XMLHttpRequest {
    abort() {}
    getAllResponseHeaders() {}
    getResponseHeader() {}
    open() {}
    send() {}
    setRequestHeader() {}
  }
  const surface = {
    WEBVIEW_SERVER_URL: 'https://localhost',
    androidBridge: { postMessage() {} },
    CapacitorHttpAndroidInterface: { isEnabled: () => true },
    console: { ...console, time() {}, timeEnd() {} },
    Document,
    HTMLDocument: Document,
    XMLHttpRequest,
    Headers,
    Request,
    Response,
    URL,
    URLSearchParams,
    Blob,
    File,
    FormData,
    ReadableStream,
    Uint8Array,
    TextDecoder,
    fetch: web as typeof fetch,
    Capacitor: { nativePromise: native },
  };
  const context = { ...surface, window: surface };
  // The shipped script receives globalThis; keep that identity equal to window.
  runInNewContext(bridgeSource, { ...context, globalThis: surface });
  surface.Capacitor.nativePromise = native;
  return { fetch: surface.fetch, web, native };
}

describe('selected photo bytes through the shipped native HTTP bridge', () => {
  it('keeps originals and thumbnails binary instead of using the legacy POST text path', async () => {
    const bytes = new Uint8Array([
      255, 216, 255, 224, 0, 128, 195, 40, 255, 217,
    ]);
    const transport = nativeTransport(bytes);
    const legacy = await transport.fetch('https://api.example.test/photo', {
      method: 'POST',
    });
    expect(new Uint8Array(await legacy.arrayBuffer())).not.toEqual(bytes);
    expect(transport.native).toHaveBeenCalledOnce();
    transport.native.mockClear();

    const api = new PhotoSourcesApi(
      new Configuration({
        basePath: 'https://api.example.test',
        headers: { Authorization: 'Bearer test-token' },
        fetchApi: transport.fetch,
      }),
    );
    const owner = new AbortController();
    const preview = await readPhotoThumbnail(
      api,
      'space',
      'selection',
      'item',
      owner.signal,
    );
    const original = await api.readSelectedPhoto(
      { spaceId: 'space', selectionId: 'selection', itemId: 'item' },
      { signal: owner.signal, cache: 'no-store' },
    );
    for (const photo of [preview, original]) {
      expect(new Uint8Array(await photo.arrayBuffer())).toEqual(bytes);
      expect(photo.type).toBe('image/jpeg');
    }
    expect(transport.native).not.toHaveBeenCalled();
    expect(transport.web).toHaveBeenCalledTimes(2);
    for (const [url, options] of transport.web.mock.calls as unknown as [
      string,
      RequestInit,
    ][]) {
      const proxy = new URL(url);
      expect(proxy.origin).toBe('https://localhost');
      expect(proxy.pathname).toBe('/_capacitor_http_interceptor_');
      expect(proxy.searchParams.get('u')).toContain(
        '/photo-selections/selection/items/item',
      );
      expect(options.method).toBe('GET');
      expect(options.cache).toBe('no-store');
      expect(options.signal).toBe(owner.signal);
      expect(new Headers(options.headers).get('Authorization')).toBe(
        'Bearer test-token',
      );
    }
  });
});
