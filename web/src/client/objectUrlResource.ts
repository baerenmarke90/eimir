export interface OwnedObjectUrl {
  readonly url: string;
  dispose(): void;
}

export type ObjectUrlSource = Blob | string;

interface ObjectUrlResourceOptions {
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

/**
 * Takes ownership of an existing Object URL.
 *
 * The returned handle is the sole owner and dispose() is idempotent. Callers
 * must not revoke the URL directly after ownership has been transferred.
 */
export function adoptObjectUrl(
  url: string,
  revokeObjectUrl: (url: string) => void = (value) =>
    URL.revokeObjectURL(value),
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
    options.createObjectUrl ?? ((value: Blob) => URL.createObjectURL(value));
  const revokeObjectUrl =
    options.revokeObjectUrl ?? ((value: string) => URL.revokeObjectURL(value));

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
