import { compressVideo } from './compressVideo';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<File>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = async ({ data: file }) => {
  try {
    const buffer = await compressVideo(file, (progress) =>
      scope.postMessage({ type: 'progress', progress }),
    );
    if (buffer) scope.postMessage({ type: 'done', buffer }, [buffer]);
    else scope.postMessage({ type: 'original' });
  } catch {
    // No file names, metadata, codec diagnostics or private bytes enter logs.
    scope.postMessage({ type: 'failed' });
  }
};
