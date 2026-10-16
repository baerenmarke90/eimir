export interface OwnedObjectUrl {
  readonly url: string;
  dispose(): void;
}

export type ObjectUrlSource = Blob | string;

interface ObjectUrlResourceOptions {
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

function captureBrowserRevokeObjectUrl(): (url: string) => void {
  const revokeObjectUrl = URL.revokeObjectURL;
  return typeof revokeObjectUrl === 'function'
    ? revokeObjectUrl.bind(URL)
    : () => undefined;
}

function captureBrowserCreateObjectUrl(): (blob: Blob) => string {
  const createObjectUrl = URL.createObjectURL;
  if (typeof createObjectUrl !== 'function') {
    throw new Error('URL.createObjectURL is unavailable.');
  }
  return createObjectUrl.bind(URL);
}

/**
 * Takes ownership of an existing Object URL.
 *
 * The returned handle is the sole owner and dispose() is idempotent. Callers
 * must not revoke the URL directly after ownership has been transferred.
 *
 * The browser revoker is captured at adoption time. This keeps the ownership
 * handle self-contained even when a test/runtime later replaces the global URL
 * methods, while still degrading to a no-op where revocation is unavailable.
 */
export function adoptObjectUrl(
  url: string,
  revokeObjectUrl: (url: string) => void = captureBrowserRevokeObjectUrl(),
): OwnedObjectUrl {
  let disposed = false;

  return {
    url,
    dispose() {
      if (disposed) return;
      disposed = true;
      revokeObjectUrl(url);
    },
  };
}

/**
 * Creates a single-owner Object URL handle for a Blob/File.
 */
export function createOwnedObjectUrl(
  blob: Blob,
  options: ObjectUrlResourceOptions = {},
): OwnedObjectUrl {
  const createObjectUrl =
    options.createObjectUrl ?? captureBrowserCreateObjectUrl();
  const revokeObjectUrl =
    options.revokeObjectUrl ?? captureBrowserRevokeObjectUrl();

  return adoptObjectUrl(createObjectUrl(blob), revokeObjectUrl);
}

/**
 * Normalizes either an already-created Object URL or a Blob into the same
 * explicit single-owner resource contract.
 */
export function ownObjectUrlSource(source: ObjectUrlSource): OwnedObjectUrl {
  return typeof source === 'string'
    ? adoptObjectUrl(source)
    : createOwnedObjectUrl(source);
}
