// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import type { TransferImportDetail } from '../api/generated/models/TransferImportDetail';
import type { TransferImportSummary } from '../api/generated/models/TransferImportSummary';
import { TransferImportApplyMode } from '../api/generated/models/TransferImportApplyMode';
import { TransferScope } from '../api/generated/models/TransferScope';
import { ClientProblemError } from '../client/problemDetails';
import { formatStorageBytes as formatBytes } from '../client/transferImport';
import m5s6 from '../i18n/locales/m5s6';
import { TransferImportSection } from './TransferImportSection';

const copy = m5s6.transfer;

/** Sizes as Testing Library reads them: its text normalizer turns no-break spaces into spaces. */
const formatStorageBytes = (value: number, locale: string) =>
  formatBytes(value, locale).replace(/ /g, ' ');

/** Locale copy with its placeholders filled, as the UI renders it. */
function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(values[key]),
  );
}
const IMPORT_ID = '01a1ff11-f4f7-7e9b-b7ed-e1f581e613b5';

const transferApi = vi.hoisted(() => ({
  applyTransferImport: vi.fn(),
  createTransferImport: vi.fn(),
  getTransferImport: vi.fn(),
  getTransferSkippedVideos: vi.fn(),
  dismissTransferSkippedVideos: vi.fn(),
}));
const uploadPolicy = vi.hoisted(() => vi.fn());

vi.mock('../client/transfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client/transfer')>();
  return { ...actual, createTransferApi: () => transferApi };
});
vi.mock('../api/generated/apis/AttachmentsApi', () => ({
  AttachmentsApi: class {
    getAttachmentUploadPolicy = uploadPolicy;
  },
}));
vi.mock('../client/importCacheConvergence', () => ({
  useImportCacheConvergence: () => null,
}));

function summary(
  overrides: Partial<TransferImportSummary> = {},
): TransferImportSummary {
  return {
    scope: TransferScope.SHARED,
    recordCounts: { memories: 12 },
    mediaCount: 30,
    sourceMemberCount: 2,
    alreadyPresentCount: 0,
    videoCount: 0,
    videoBytes: 0,
    videosNeedPro: false,
    skippedVideoCount: 0,
    recoverableVideoCount: 0,
    recoveredVideoCount: 0,
    unrecoveredVideoCount: 0,
    recoverableVideoBytes: 0,
    storageNeeded: 1_200_000_000,
    storageNeededWithoutVideos: 1_100_000_000,
    storageAvailable: 3_200_000_000,
    storageQuotaExceeded: false,
    storageFitsWithoutVideos: true,
    ...overrides,
  };
}

function detail(
  value: TransferImportSummary | null,
  overrides: Partial<TransferImportDetail> = {},
): TransferImportDetail {
  return {
    id: IMPORT_ID,
    status: ImportStatus.READY_TO_APPLY,
    scope: TransferScope.SHARED,
    createdAt: new Date('2026-11-21T10:00:00Z'),
    validatedAt: new Date('2026-11-21T10:01:00Z'),
    completedAt: null,
    expiresAt: new Date('2026-11-22T10:00:00Z'),
    artifactSize: 1024,
    errorCode: null,
    summary: value,
    ...overrides,
  };
}

function renderSection(requestedImportId: string | null = IMPORT_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TransferImportSection
          apiBaseUrl="https://api.example.test"
          accessToken="token"
          spaceId="space-1"
          requestedImportId={requestedImportId}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function link(name: string): HTMLAnchorElement {
  return screen.getByRole('link', { name }) as HTMLAnchorElement;
}

async function confirmAndApply(action: string) {
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: action }));
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  for (const mock of Object.values(transferApi)) mock.mockReset();
  uploadPolicy.mockReset().mockResolvedValue({
    acceptedMimeTypes: [],
    videoMaxBytes: 1,
    videoMaxDurationSeconds: 1,
    videoProcessingEnabled: true,
    videoUploadAllowed: false,
  });
  transferApi.getTransferSkippedVideos.mockResolvedValue({
    count: 0,
    totalSize: 0,
  });
  transferApi.applyTransferImport.mockResolvedValue(
    detail(summary(), { status: ImportStatus.APPLYING }),
  );
});

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

describe('TransferImportSection', () => {
  it('describes the file in sentences and imports everything when it fits', async () => {
    transferApi.getTransferImport.mockResolvedValue(
      detail(summary({ alreadyPresentCount: 4 })),
    );
    renderSection();

    expect(
      await screen.findByText(fill(copy.import.lead_other, { count: 12 })),
    ).toBeTruthy();
    expect(
      screen.getByText(fill(copy.import.media_other, { count: 30 })),
    ).toBeTruthy();
    expect(
      screen.getByText(fill(copy.import.present_other, { count: 4 })),
    ).toBeTruthy();
    expect(
      screen.getByText(
        fill(copy.import.storage, {
          needed: formatStorageBytes(1_200_000_000, 'de-DE'),
          available: formatStorageBytes(3_200_000_000, 'de-DE'),
        }),
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('term')).toBeNull();

    await confirmAndApply(copy.import.apply);
    await waitFor(() =>
      expect(transferApi.applyTransferImport).toHaveBeenCalledWith(
        expect.objectContaining({
          transferImportApply: { mode: TransferImportApplyMode.ALL },
        }),
      ),
    );
  });

  it('imports without the videos when they need Pro', async () => {
    transferApi.getTransferImport.mockResolvedValue(
      detail(summary({ videoCount: 6, videosNeedPro: true })),
    );
    renderSection();

    expect(
      await screen.findByText(copy.import.videosNeedPro.title),
    ).toBeTruthy();
    expect(link(copy.import.discoverPro).getAttribute('href')).toBe(
      '/more/pro',
    );
    await confirmAndApply(copy.import.applyWithoutVideos);
    await waitFor(() =>
      expect(transferApi.applyTransferImport).toHaveBeenCalledWith(
        expect.objectContaining({
          transferImportApply: { mode: TransferImportApplyMode.WITHOUT_VIDEOS },
        }),
      ),
    );
  });

  it('offers leaving the videos out when only that fits', async () => {
    transferApi.getTransferImport.mockResolvedValue(
      detail(summary({ videoCount: 6, storageQuotaExceeded: true })),
    );
    renderSection();

    expect(
      await screen.findByText(copy.import.fitsWithoutVideos.title),
    ).toBeTruthy();
    expect(link(copy.import.morePro).getAttribute('href')).toBe(
      '/more/pro?context=storage',
    );
    await confirmAndApply(copy.import.applyWithoutVideos);
    await waitFor(() =>
      expect(transferApi.applyTransferImport).toHaveBeenCalledWith(
        expect.objectContaining({
          transferImportApply: { mode: TransferImportApplyMode.WITHOUT_VIDEOS },
        }),
      ),
    );
  });

  it('offers space or Pro instead of an import that does not fit', async () => {
    transferApi.getTransferImport.mockResolvedValue(
      detail(
        summary({ storageQuotaExceeded: true, storageAvailable: 800_000_000 }),
      ),
    );
    renderSection();

    expect(await screen.findByText(copy.import.noRoom.title)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(
      screen.queryByRole('button', { name: copy.import.apply }),
    ).toBeNull();
    expect(link(copy.import.morePro).getAttribute('href')).toBe(
      '/more/pro?context=storage',
    );
    expect(link(copy.import.viewMedia).getAttribute('href')).toBe(
      '/story/photos',
    );
  });

  it('explains a refusal through the refreshed preview, never as an error', async () => {
    transferApi.getTransferImport
      .mockResolvedValueOnce(detail(summary()))
      .mockResolvedValue(
        detail(summary({ storageQuotaExceeded: true }), {
          errorCode: 'STORAGE_QUOTA_EXCEEDED',
        }),
      );
    transferApi.applyTransferImport.mockRejectedValue(
      new ClientProblemError('validation', 413, 'STORAGE_QUOTA_EXCEEDED'),
    );
    renderSection();

    await confirmAndApply(copy.import.apply);
    expect(await screen.findByText(copy.import.roomTaken.title)).toBeTruthy();
    expect(screen.getByText(copy.import.noRoom.title)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports a finished import with the skipped videos and a way to the result', async () => {
    transferApi.getTransferImport.mockResolvedValue(
      detail(summary({ skippedVideoCount: 6 }), {
        status: ImportStatus.COMPLETED,
      }),
    );
    renderSection();

    expect(await screen.findByText(copy.import.completed.title)).toBeTruthy();
    expect(
      screen.getByText(fill(copy.import.completed.skipped_other, { count: 6 })),
    ).toBeTruthy();
    expect(link(copy.import.completed.toMoments).getAttribute('href')).toBe(
      '/story',
    );
  });

  it('says that nothing changed when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    transferApi.getTransferImport.mockResolvedValue(detail(summary()));
    renderSection();

    expect(await screen.findByText(copy.import.offline.title)).toBeTruthy();
    fireEvent.click(await screen.findByRole('checkbox'));
    expect(
      (
        screen.getByRole('button', {
          name: copy.import.apply,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  describe('skipped videos', () => {
    beforeEach(() => {
      transferApi.getTransferSkippedVideos.mockResolvedValue({
        count: 6,
        totalSize: 480_000_000,
      });
    });

    it('offers a quiet Pro hint without the video capability', async () => {
      renderSection(null);

      expect(await screen.findByText(copy.skipped.heading)).toBeTruthy();
      expect(
        screen.getByText(
          fill(copy.skipped.lead_other, {
            count: 6,
            size: formatStorageBytes(480_000_000, 'de-DE'),
          }),
        ),
      ).toBeTruthy();
      expect(await screen.findByText(copy.skipped.bodyFree)).toBeTruthy();
      expect(link(copy.import.discoverPro).getAttribute('href')).toBe(
        '/more/pro',
      );
      expect(screen.queryByText(copy.skipped.recover)).toBeNull();
    });

    it('recovers exactly the remembered videos from the same file with Pro', async () => {
      uploadPolicy.mockResolvedValue({
        acceptedMimeTypes: [],
        videoMaxBytes: 1,
        videoMaxDurationSeconds: 1,
        videoProcessingEnabled: true,
        videoUploadAllowed: true,
      });
      const staged = detail(
        summary({
          recoverableVideoCount: 6,
          recoverableVideoBytes: 480_000_000,
        }),
      );
      transferApi.createTransferImport.mockResolvedValue(staged);
      transferApi.getTransferImport.mockResolvedValue(staged);
      renderSection(null);

      const picker = (await screen.findByLabelText(
        copy.skipped.recover,
      )) as HTMLInputElement;
      fireEvent.change(picker, {
        target: { files: [new File(['bundle'], 'eimir-export.zip')] },
      });
      fireEvent.click(
        await screen.findByRole('button', {
          name: fill(copy.import.recover.action_other, { count: 6 }),
        }),
      );
      await waitFor(() =>
        expect(transferApi.applyTransferImport).toHaveBeenCalledWith(
          expect.objectContaining({
            transferImportApply: { mode: TransferImportApplyMode.VIDEOS_ONLY },
          }),
        ),
      );
    });

    it('asks once before hiding the note', async () => {
      transferApi.dismissTransferSkippedVideos.mockResolvedValue(undefined);
      renderSection(null);

      fireEvent.click(
        await screen.findByRole('button', { name: copy.skipped.dismiss }),
      );
      expect(await screen.findByText(copy.skipped.dismissBody)).toBeTruthy();
      expect(transferApi.dismissTransferSkippedVideos).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: copy.skipped.dismissConfirm }),
      );
      await waitFor(() =>
        expect(transferApi.dismissTransferSkippedVideos).toHaveBeenCalledTimes(
          1,
        ),
      );
    });
  });
});
