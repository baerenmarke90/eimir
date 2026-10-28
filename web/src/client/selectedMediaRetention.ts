/** Ephemeral retention metadata follows a File without becoming its content. */
export interface SelectedPhotoDescriptor {
  name: string;
  type: string;
  lastModified: number;
  size: number;
}

const volatileFiles = new WeakMap<
  File,
  { descriptor: SelectedPhotoDescriptor; unavailable: boolean }
>();

export function retainPhotoInMemory(file: File): File {
  if (!volatileFiles.has(file))
    volatileFiles.set(file, {
      descriptor: {
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        size: file.size,
      },
      unavailable: false,
    });
  return file;
}

export function memoryOnlyPhotoDescriptor(
  file: File,
): SelectedPhotoDescriptor | undefined {
  return volatileFiles.get(file)?.descriptor;
}

export function missingSelectedPhoto(
  descriptor: SelectedPhotoDescriptor,
): File {
  const file = new File([], descriptor.name, {
    type: descriptor.type,
    lastModified: descriptor.lastModified,
  });
  volatileFiles.set(file, { descriptor: { ...descriptor }, unavailable: true });
  return file;
}

export function selectedPhotoUnavailable(file: File): boolean {
  return volatileFiles.get(file)?.unavailable === true;
}
