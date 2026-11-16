/** Saved slots remain visible while bytes transfer, validate, or need replacement. */
export function isGalleryAttachment(item: { status: string }): boolean {
  return ['READY', 'PENDING', 'PROCESSING', 'FAILED'].includes(item.status);
}
