// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { fireEvent, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import type { TransferImportDetail } from '../api/generated/models/TransferImportDetail';
import { TransferScope } from '../api/generated/models/TransferScope';
import { TransferPanel } from '../components/TransferPanel';
import m5s6 from '../i18n/locales/m5s6';
import { clearProductReadCache } from './productReadCache';
import { useImportCacheConvergence } from './importCacheConvergence';

vi.mock('./productReadCache', () => ({
  clearProductReadCache: vi.fn(),
}));

const transferApi = vi.hoisted(() => ({
  applyTransferImport: vi.fn(),
  createTransferImport: vi.fn(),
  getTransferImport: vi.fn(),
}));

vi.mock('./transfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transfer')>();
  return { ...actual, createTransferApi: () => transferApi };
});

const SPACE_ID = 'space-1';

function detail(status: TransferImportDetail['status']): TransferImportDetail {
  return {
    artifactSize: 512,
    completedAt:
      status === ImportStatus.COMPLETED
        ? new Date('2026-09-15T10:02:00Z')
        : null,
    createdAt: new Date('2026-09-15T10:00:00Z'),
    errorCode: status === ImportStatus.FAILED ? 'IMPORT_FAILED' : null,
    expiresAt: new Date('2026-09-15T11:00:00Z'),
    id: 'import-1',
    scope: TransferScope.PERSONAL,
    status,
    summary: null,
    validatedAt: new Date('2026-09-15T10:01:00Z'),
  };
}

function Harness({ value }: { value: TransferImportDetail }) {
  const error = useImportCacheConvergence(value, SPACE_ID);
  return error ? <div role="alert">{String(error)}</div> : null;
}

function renderHarness(value: TransferImportDetail) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['story', SPACE_ID], { value: 'stale' });
  client.setQueryData(['profile-identity', SPACE_ID, 'account-1'], {
    value: 'stale',
  });
  client.setQueryData(['story', 'space-2'], { value: 'foreign' });
  client.setQueryData(['transfer', 'import', SPACE_ID, 'import-1'], value);

  const renderResult = render(
    <QueryClientProvider client={client}>
      <Harness value={value} />
    </QueryClientProvider>,
  );
  const rerender = (next: TransferImportDetail): void =>
    renderResult.rerender(
      <QueryClientProvider client={client}>
        <Harness value={next} />
      </QueryClientProvider>,
    );
  return { client, rerender };
}

function isInvalidated(client: QueryClient, queryKey: readonly unknown[]) {
  return client.getQueryState(queryKey)?.isInvalidated;
}

beforeEach(() => {
  vi.mocked(clearProductReadCache).mockReset().mockResolvedValue();
  transferApi.applyTransferImport.mockReset();
  transferApi.createTransferImport.mockReset();
  transferApi.getTransferImport.mockReset();
});

describe('import cache convergence', () => {
  it('follows apply into polling before converging on the terminal result', async () => {
    const ready = {
      ...detail(ImportStatus.READY_TO_APPLY),
      summary: {
        mediaCount: 0,
        recordCounts: { private_notes: 1 },
        scope: TransferScope.PERSONAL,
        sourceMemberCount: 1,
      },
    };
    transferApi.createTransferImport.mockResolvedValue(ready);
    transferApi.getTransferImport
      .mockResolvedValueOnce(ready)
      .mockResolvedValue(detail(ImportStatus.APPLYING));
    transferApi.applyTransferImport.mockResolvedValue(
      detail(ImportStatus.APPLYING),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    client.setQueryData(['story', SPACE_ID], { value: 'stale' });
    render(
      <QueryClientProvider client={client}>
        <TransferPanel
          apiBaseUrl="https://api.example.test"
          accessToken="token"
          spaceId={SPACE_ID}
        />
      </QueryClientProvider>,
    );

    const fileInput = screen.getByLabelText(
      m5s6.transfer.import.fileLabel,
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['bundle'], 'transfer.zip')] },
    });
    fireEvent.submit(fileInput.closest('form') as HTMLFormElement);
    await screen.findByText(m5s6.transfer.import.status.READY_TO_APPLY);

    fireEvent.click(screen.getByLabelText(m5s6.transfer.import.confirm));
    fireEvent.click(
      screen.getByRole('button', { name: m5s6.transfer.import.apply }),
    );
    await screen.findByText(m5s6.transfer.import.status.APPLYING);
    expect(clearProductReadCache).not.toHaveBeenCalled();

    client.setQueryData(
      ['transfer', 'import', SPACE_ID, 'import-1'],
      detail(ImportStatus.COMPLETED),
    );
    await screen.findByText(m5s6.transfer.import.status.COMPLETED);
    await waitFor(() => expect(clearProductReadCache).toHaveBeenCalledTimes(1));
    expect(isInvalidated(client, ['story', SPACE_ID])).toBe(true);
  });

  it('invalidates both cache layers once when polling reaches COMPLETED', async () => {
    const { client, rerender } = renderHarness(
      detail(ImportStatus.READY_TO_APPLY),
    );
    rerender(detail(ImportStatus.APPLYING));
    expect(clearProductReadCache).not.toHaveBeenCalled();

    rerender(detail(ImportStatus.COMPLETED));
    await waitFor(() => expect(clearProductReadCache).toHaveBeenCalledTimes(1));
    expect(isInvalidated(client, ['story', SPACE_ID])).toBe(true);
    expect(
      isInvalidated(client, ['profile-identity', SPACE_ID, 'account-1']),
    ).toBe(true);
    expect(isInvalidated(client, ['story', 'space-2'])).toBe(false);
    expect(
      isInvalidated(client, ['transfer', 'import', SPACE_ID, 'import-1']),
    ).toBe(false);

    rerender(detail(ImportStatus.COMPLETED));
    await Promise.resolve();
    expect(clearProductReadCache).toHaveBeenCalledTimes(1);
  });

  it('surfaces convergence failures under React StrictMode', async () => {
    let rejectClear: ((error: Error) => void) | undefined;
    vi.mocked(clearProductReadCache).mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectClear = reject;
        }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <Harness value={detail(ImportStatus.COMPLETED)} />
        </QueryClientProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(clearProductReadCache).toHaveBeenCalledTimes(1));

    rejectClear?.(new Error('cache wipe failed'));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'cache wipe failed',
    );
  });

  it.each([ImportStatus.FAILED, ImportStatus.EXPIRED])(
    'does not invalidate product caches for %s imports',
    async (status) => {
      const { client, rerender } = renderHarness(detail(ImportStatus.APPLYING));
      rerender(detail(status));
      await Promise.resolve();

      expect(clearProductReadCache).not.toHaveBeenCalled();
      expect(isInvalidated(client, ['story', SPACE_ID])).toBe(false);
    },
  );
});
