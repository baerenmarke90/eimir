/*
 * Creates Object URLs off the main thread (#2063). Registering an Object URL
 * is a synchronous call into the browser process; on a phone it sometimes
 * waits 100–250 ms while the browser is busy (for example as the map starts),
 * which froze the page. Here only this worker waits.
 *
 * The URLs live as long as this worker, which the page keeps for its whole
 * life. The page revokes them itself (`URL.revokeObjectURL` works on the
 * same origin and takes effect at once), so ownership and revocation stay
 * exactly where they were.
 */

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; blob: Blob }>) => void) | null;
  postMessage: (message: { id: number; url: string | null }) => void;
};

scope.onmessage = ({ data: { id, blob } }) => {
  let url: string | null = null;
  try {
    url = URL.createObjectURL(blob);
  } catch {
    // The page falls back to creating the URL itself.
  }
  scope.postMessage({ id, url });
};
