// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportStatus } from '../api/generated/models/ExportStatus';
import type { TransferExportDetail } from '../api/generated/models/TransferExportDetail';
import { TransferScope } from '../api/generated/models/TransferScope';
import m5s6 from '../i18n/locales/m5s6';
import { TransferPanel } from './TransferPanel';

const copy = m5s6.transfer;
const EXPORT_ID = '01a1ff11-f4f7-7e9b-b7ed-e1f581e613b5';

const transferApi = vi.hoisted(() => ({
  createTransferExport: vi.fn(),
  getTransferExport: vi.fn(),
  downloadTransferExport: vi.fn(),
  getTransferImport: vi.fn(),
  getTransferSkippedVideos: vi.fn(),
}));

vi.mock('../client/transfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client/transfer')>();
  return { ...actual, createTransferApi: () => transferApi };
});
vi.mock('../api/generated/apis/AttachmentsApi', () => ({
  AttachmentsApi: class {
    getAttachmentUploadPolicy = vi.fn().mockResolvedValue({
      acceptedMimeTypes: [],
      videoMaxBytes: 1,
      videoMaxDurationSeconds: 1,
      videoProcessingEnabled: true,
      videoUploadAllowed: false,
    });
  },
}));
vi.mock('../client/importCacheConvergence', () => ({
  useImportCacheConvergence: () => null,
}));

function exportDetail(
  status: ExportStatus,
  errorCode: string | null = null,
): TransferExportDetail {
  return {
    id: EXPORT_ID,
    scope: TransferScope.SHARED,
    status,
    createdAt: new Date('2026-11-22T10:00:00Z'),
    readyAt: null,
    expiresAt: new Date('2026-11-23T10:00:00Z'),
    artifactSize: null,
    errorCode,
    downloadUrl: null,
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TransferPanel
          apiBaseUrl="https://api.example.test"
          accessToken="token"
          spaceId="space-1"
          requestedExportId={EXPORT_ID}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(transferApi)) mock.mockReset();
  transferApi.getTransferSkippedVideos.mockResolvedValue({
    count: 0,
    bytes: 0,
  });
});

describe('a failed export names its cause', () => {
  it.each([
    ['TRANSFER_TOO_LARGE', copy.failure.exportTooLarge],
    ['TRANSFER_EXPORT_FAILED', copy.failure.exportFailed],
    ['SOMETHING_UNKNOWN', copy.failure.exportGeneric],
    [null, copy.failure.exportGeneric],
  ])('shows the text for %s', async (code, text) => {
    transferApi.getTransferExport.mockResolvedValue(
      exportDetail(ExportStatus.FAILED, code),
    );
    renderPanel();

    expect(await screen.findByText(text.title)).toBeTruthy();
    expect(screen.getByText(text.body)).toBeTruthy();
    // No status row and no download hint beside a failure, and no technical code.
    expect(screen.queryByText(copy.export.statusLabel)).toBeNull();
    expect(
      screen.queryByText(copy.export.expires, { exact: false }),
    ).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /TRANSFER_|SOMETHING_UNKNOWN/,
    );
  });

  it('says an expired export has expired instead of showing a failure', async () => {
    transferApi.getTransferExport.mockResolvedValue(
      exportDetail(ExportStatus.EXPIRED),
    );
    renderPanel();

    expect(
      await screen.findByText(copy.failure.exportExpired.title),
    ).toBeTruthy();
    expect(screen.getByText(copy.failure.exportExpired.body)).toBeTruthy();
    expect(screen.queryByText(copy.failure.exportGeneric.title)).toBeNull();
  });

  it('keeps the status row for an export that is still being made', async () => {
    transferApi.getTransferExport.mockResolvedValue(
      exportDetail(ExportStatus.RUNNING),
    );
    renderPanel();

    expect(await screen.findByText(copy.export.status.RUNNING)).toBeTruthy();
    expect(screen.queryByText(copy.failure.exportGeneric.title)).toBeNull();
  });
});
