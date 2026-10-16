import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import { ServerAdminJobsPanel } from './ServerAdminJobsPanel';
import { ServerAdminStoragePanel } from './ServerAdminStoragePanel';

const api = {} as ServerAdminApi;

function renderWithClient(client: QueryClient, node: ReactNode): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe('ServerAdmin observability drill-downs', () => {
  it('renders paginated privacy-safe job metadata with exhaustion state', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      [
        'server-admin',
        'jobs',
        {
          status: undefined,
          kind: undefined,
          exhausted: undefined,
          createdWithin: undefined,
          limit: 25,
          offset: 0,
        },
      ],
      {
        total: 1,
        limit: 25,
        offset: 0,
        items: [
          {
            id: 'job-safe-id',
            kind: 'mail.dispatch',
            status: 'FAILED',
            attempts: 3,
            maxAttempts: 3,
            createdAt: new Date('2026-09-04T10:00:00Z'),
            runAfter: new Date('2026-09-04T10:01:00Z'),
            finishedAt: new Date('2026-09-04T10:02:00Z'),
            exhausted: true,
            delayed: false,
            pendingAgeSeconds: null,
          },
        ],
      },
    );

    const html = renderWithClient(
      queryClient,
      <ServerAdminJobsPanel api={api} />,
    );

    expect(html).toContain('Job-Verzeichnis');
    expect(html).toContain('mail.dispatch');
    expect(html).toContain('job-safe-id');
    expect(html).toContain('Ausgeschöpft');
    expect(html).toContain('Maximale Versuche erreicht');
    expect(html).toContain('Job-Payloads');
    expect(html).not.toContain('last_error');
    expect(html).not.toContain('locked_by');
  });

  it('renders aggregate storage state without attachment browsing surfaces', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['server-admin', 'storage'], {
      readyCount: 12,
      readyBytes: 10_485_760,
      readySizeUnknownCount: 1,
      thumbnailReadyCount: 8,
      failedCount: 2,
      deleteFailedCount: 1,
      uploadingCount: 3,
      validatingCount: 1,
      deletingCount: 1,
      statusCounts: [
        { status: 'READY', count: 12 },
        { status: 'FAILED', count: 2 },
        { status: 'DELETE_FAILED', count: 1 },
      ],
      mediaTypeCounts: [
        { mediaType: 'IMAGE', count: 10 },
        { mediaType: 'VIDEO', count: 5 },
      ],
      growth: [
        {
          window: '24h',
          readyCount: 2,
          readyBytes: 2_097_152,
          readySizeUnknownCount: 0,
        },
        {
          window: '7d',
          readyCount: 5,
          readyBytes: 5_242_880,
          readySizeUnknownCount: 1,
        },
        {
          window: '30d',
          readyCount: 12,
          readyBytes: 10_485_760,
          readySizeUnknownCount: 1,
        },
      ],
    });

    const html = renderWithClient(
      queryClient,
      <ServerAdminStoragePanel api={api} />,
    );

    expect(html).toContain('Speicher');
    expect(html).toContain('Lifecycle-Verteilung');
    expect(html).toContain('READY-Wachstum');
    expect(html).toContain('Bilder');
    expect(html).toContain('Videos');
    expect(html).toContain('Private Dateinamen');
    expect(html).not.toContain('Original-Dateiname');
    expect(html).not.toContain('Download');
    expect(html).not.toContain('Storage-Key');
  });
});
