// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createBinaryUploadRequest } from './binaryUploadTransport';
const environment = vi.hoisted(() => ({ native: true }));
vi.mock('../pwa', () => ({ isCapacitorNative: () => environment.native }));
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>)
    .CapacitorWebXMLHttpRequest;
});

it('sends the original File through retained browser methods, avoiding bridge serialization', () => {
  const opened = vi.fn();
  const sent = vi.fn();
  const aborted = vi.fn();
  class BrowserRequest {
    upload = new EventTarget();
  }
  Object.assign(window, {
    CapacitorWebXMLHttpRequest: {
      constructor: BrowserRequest,
      open: opened,
      send: sent,
      abort: aborted,
      setRequestHeader: vi.fn(),
      getResponseHeader: vi.fn(),
      getAllResponseHeaders: vi.fn(),
    },
  });
  vi.stubGlobal(
    'XMLHttpRequest',
    vi.fn(() => {
      throw new Error('Patched bridge must not be called.');
    }),
  );
  const request = createBinaryUploadRequest();
  const file = new File([new Uint8Array(2 * 1024 * 1024)], 'clip.mp4', {
    type: 'video/mp4',
  });
  request.open('PUT', 'https://instance.test/content');
  request.send(file);
  request.abort();
  expect(opened).toHaveBeenCalledWith('PUT', 'https://instance.test/content');
  expect(sent).toHaveBeenCalledWith(file);
  expect(sent.mock.contexts[0]).toBe(request);
  expect(aborted).toHaveBeenCalledTimes(1);
});
