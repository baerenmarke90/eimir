import { isCapacitorNative } from '../pwa';

type BrowserXhrBridge = Pick<
  XMLHttpRequest,
  | 'open'
  | 'send'
  | 'abort'
  | 'setRequestHeader'
  | 'getResponseHeader'
  | 'getAllResponseHeaders'
> & { constructor: new () => XMLHttpRequest };

/** Capacitor 8's JSON HTTP bridge buffers File bodies and omits upload events.
 * Use its retained browser transport for binary bodies, without changing API
 * requests or the global prototype. The API permits this packaged origin only
 * on the authorized streaming upload route. Object-store CORS stays provider-owned.
 */
export function createBinaryUploadRequest(): XMLHttpRequest {
  if (!isCapacitorNative()) return new XMLHttpRequest();
  const bridge = (
    window as Window & {
      CapacitorWebXMLHttpRequest?: BrowserXhrBridge;
    }
  ).CapacitorWebXMLHttpRequest;
  if (!bridge) throw new Error('The packaged binary transport is unavailable.');
  const request = new bridge.constructor();
  for (const method of [
    'open',
    'send',
    'abort',
    'setRequestHeader',
    'getResponseHeader',
    'getAllResponseHeaders',
  ] as const) {
    Object.defineProperty(request, method, {
      value: bridge[method].bind(request),
      configurable: true,
    });
  }
  return request;
}
