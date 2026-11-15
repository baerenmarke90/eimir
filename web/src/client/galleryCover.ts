/** Independent cover choice; callers keep the gallery in its authored order. */
export function galleryCover<
  T extends { id: string; position: number },
>(gallery: {
  attachments?: T[];
  selectedCoverAttachmentId?: string | null;
}): T | undefined {
  const attachments = gallery.attachments ?? [];
  return (
    attachments.find((item) => item.id === gallery.selectedCoverAttachmentId) ??
    [...attachments].sort((a, b) => a.position - b.position)[0]
  );
}
