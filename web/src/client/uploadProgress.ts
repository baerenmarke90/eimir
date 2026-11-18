/** Progress is a high-water mark within one attempt; only an explicit retry resets it. */
export function advanceUploadProgress(previous: number, next: number): number {
  if (!Number.isFinite(next)) return previous;
  return Math.max(previous, Math.min(100, Math.max(0, next)));
}
