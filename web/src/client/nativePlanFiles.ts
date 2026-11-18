import { registerPlugin } from '@capacitor/core';
import type { PlanFileSummary } from '../api/generated/models/PlanFileSummary';
import { Configuration } from './apiConfiguration';
import { AttachmentsApi } from './mediaApis';

interface PlanFilesPlugin {
  preparePdf(options: {
    url: string;
    authorization: string;
    size: number;
  }): Promise<{
    status: number;
    fileId?: string;
  }>;
  openPdf(options: { fileId: string; name: string }): Promise<void>;
  discardPdf(options: { fileId: string }): Promise<void>;
}

const plugin = registerPlugin<PlanFilesPlugin>('PlanFiles');

export async function openNativePlanFile(
  apiBaseUrl: string,
  accessToken: string,
  spaceId: string,
  file: PlanFileSummary,
  signal: AbortSignal,
): Promise<void> {
  let preparedId: string | undefined;
  const attachments = new AttachmentsApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
      // Keep token refresh in the session client and stream the response on
      // Android without copying a PDF through the WebView's JSON bridge.
      fetchApi: async (url, init) => {
        signal.throwIfAborted();
        const result = await plugin.preparePdf({
          url: new URL(String(url), window.location.href).href,
          authorization: new Headers(init?.headers).get('Authorization') ?? '',
          size: file.size,
        });
        preparedId = result.fileId;
        return new Response(null, { status: result.status });
      },
    }),
  );
  try {
    await attachments.getAttachmentContentRaw(
      { spaceId, attachmentId: file.id },
      { signal },
    );
    signal.throwIfAborted();
    if (!preparedId) throw new Error('The PDF is unavailable.');
    await plugin.openPdf({ fileId: preparedId, name: file.name });
    preparedId = undefined;
  } finally {
    if (preparedId)
      await plugin.discardPdf({ fileId: preparedId }).catch(() => {});
  }
}
