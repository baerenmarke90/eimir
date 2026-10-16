import { TransferApi } from '../api/generated/apis/TransferApi';
import { ExportStatus } from '../api/generated/models/ExportStatus';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import type { TransferScope } from '../api/generated/models/TransferScope';
import { Configuration } from '../api/generated/runtime';
import { normalizeClientError } from './problemDetails';

export function createTransferApi(
  apiBaseUrl: string,
  accessToken: string,
): TransferApi {
  return new TransferApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}

export async function transferApiCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function exportStatusNeedsPolling(status?: string): boolean {
  return status === ExportStatus.QUEUED || status === ExportStatus.RUNNING;
}

export function importStatusNeedsPolling(status?: string): boolean {
  return (
    status === ImportStatus.QUEUED ||
    status === ImportStatus.VALIDATING ||
    status === ImportStatus.APPLYING
  );
}

export function transferBundleFilename(
  scope: TransferScope,
  now = new Date(),
): string {
  const date = now.toISOString().slice(0, 10);
  return `eimir-${scope.toLowerCase()}-${date}.zip`;
}

export function triggerTransferDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}
