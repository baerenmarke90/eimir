// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiRuntimeProvider } from '../client/apiRuntimeContext';
import {
  clearFailureReference,
  recordRequestFailure,
} from '../client/failureReference';
import { ClientProblemError } from '../client/problemDetails';
import {
  closeSupportReport,
  currentSupportReportRequest,
  openSupportReport,
} from '../client/supportReportLauncher';
import { settleEditorHistory } from '../client/useEditorHistoryEntry';
import supportReport from '../i18n/locales/supportReport';
import taskSheets from '../i18n/locales/taskSheets';
import { ProblemState } from './ProblemState';
import {
  SupportReportHost,
  supportReportSheetModule,
} from './SupportReportHost';

const API = 'http://api.example.test';

function session(children: ReactNode, { signedIn = true } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['instance-status', API], {
    supportReportsAvailable: true,
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ApiRuntimeProvider
        apiBaseUrl={API}
        accessToken="token"
        accountId={signedIn ? 'account-1' : undefined}
      >
        <MemoryRouter>{children}</MemoryRouter>
      </ApiRuntimeProvider>
    </QueryClientProvider>
  );
}

function openDialog(name: string) {
  return screen.findByRole('dialog', { name });
}

beforeAll(async () => {
  // As the background prefetch does in the shell; see the lazy chunk tests.
  await supportReportSheetModule.load();
  // Reduced motion: a closed sheet leaves without a retained exit phase.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(async () => {
  act(() => closeSupportReport());
  cleanup();
  // A closed sheet removes its history entry asynchronously.
  await settleEditorHistory();
  clearFailureReference();
  window.localStorage.clear();
});

describe('SupportReportHost', () => {
  it('renders nothing while no report is asked for', () => {
    const { container } = render(session(<SupportReportHost />));
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("renders the sheet with the request's kind and failure", async () => {
    render(session(<SupportReportHost />));
    act(() =>
      openSupportReport({
        kind: 'PROBLEM',
        failure: { reference: 'GET:/api/v1/memories:500:web' },
      }),
    );
    const dialog = await openDialog(supportReport.title.PROBLEM);
    expect(
      within(dialog)
        .getByRole('radio', { name: supportReport.kinds.PROBLEM })
        .matches(':checked'),
    ).toBe(true);
    // The sheet shows the short error code, never the route that is sent.
    expect(dialog.textContent).toContain('GET · 500 · web');
    expect(dialog.textContent).not.toContain('/api/v1/memories');
  });

  it('opens the sheet in the same commit once its chunk has loaded', () => {
    // The background prefetch loaded the chunk: no suspense, no waiting.
    render(session(<SupportReportHost />));
    expect(() =>
      act(() => openSupportReport({ kind: 'FEEDBACK' })),
    ).not.toThrow();
    expect(
      screen.getByRole('dialog', { name: supportReport.title.FEEDBACK }),
    ).toBeTruthy();
  });

  it('opens feedback without a failure', async () => {
    render(session(<SupportReportHost />));
    act(() => openSupportReport({ kind: 'FEEDBACK' }));
    const dialog = await openDialog(supportReport.title.FEEDBACK);
    expect(dialog.querySelector('.support-report-failure')).toBeNull();
  });

  it('closing the sheet clears the request', async () => {
    render(session(<SupportReportHost />));
    act(() => openSupportReport({ kind: 'FEEDBACK' }));
    const dialog = await openDialog(supportReport.title.FEEDBACK);
    fireEvent.click(
      within(dialog).getByRole('button', { name: taskSheets.close }),
    );
    // The sheet first removes its history entry, then reports the close.
    await waitFor(() => expect(currentSupportReportRequest()).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows nothing for a signed-out visitor', () => {
    render(session(<SupportReportHost />, { signedIn: false }));
    act(() => openSupportReport({ kind: 'FEEDBACK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clears an open request when the shell goes away', async () => {
    const { unmount } = render(session(<SupportReportHost />));
    act(() => openSupportReport({ kind: 'FEEDBACK' }));
    await openDialog(supportReport.title.FEEDBACK);
    unmount();
    expect(currentSupportReportRequest()).toBeNull();
  });

  it('sheet_survives_problem_state_unmount', async () => {
    recordRequestFailure({
      method: 'GET',
      routeTemplate: '/api/v1/memories',
      status: 500,
    });
    const view = (showError: boolean) =>
      session(
        <>
          {showError ? (
            <ProblemState
              error={new ClientProblemError('server', 500)}
              onRetry={() => {}}
            />
          ) : (
            <p>loading</p>
          )}
          <SupportReportHost />
        </>,
      );
    const { rerender } = render(view(true));
    fireEvent.click(screen.getByRole('button', { name: supportReport.action }));
    const dialog = await openDialog(supportReport.title.PROBLEM);
    const note = within(dialog).getByRole('textbox', {
      name: supportReport.noteLabel.PROBLEM,
    });
    fireEvent.change(note, { target: { value: 'Mid-sentence' } });

    // A background refetch replaces the error state while the person types.
    rerender(view(false));
    expect(
      screen.queryByRole('button', { name: supportReport.action }),
    ).toBeNull();

    const kept = screen.getByRole('dialog', {
      name: supportReport.title.PROBLEM,
    });
    expect(kept.hasAttribute('open')).toBe(true);
    expect(
      within(kept).getByRole<HTMLTextAreaElement>('textbox', {
        name: supportReport.noteLabel.PROBLEM,
      }).value,
    ).toBe('Mid-sentence');
    expect(kept.textContent).toContain('GET · 500 · web');
  });
});

// A stand-in sheet: these cases are about loading the chunk, not the sheet.
function StubSheet({
  open,
  initialKind,
}: {
  open: boolean;
  initialKind: 'PROBLEM' | 'FEEDBACK';
}) {
  return open ? <div role="dialog" aria-label={initialKind} /> : null;
}

describe('SupportReportHost lazy chunk', () => {
  /**
   * A fresh host whose sheet chunk fails `failures` times before it loads.
   * Fresh modules have a fresh launcher store, so the test uses that one.
   */
  async function freshHost(failures: number) {
    const attempts = { count: 0 };
    vi.resetModules();
    vi.doMock('./SupportReportSheet', () => {
      attempts.count += 1;
      if (attempts.count <= failures) throw new Error('chunk fetch failed');
      return { SupportReportSheet: StubSheet };
    });
    const { SupportReportHost: Host } = await import('./SupportReportHost');
    const launcher = await import('../client/supportReportLauncher');
    return { Host, launcher, attempts };
  }

  afterEach(() => {
    vi.doUnmock('./SupportReportSheet');
  });

  it('opens the sheet once the chunk loaded and reuses it for the next open', async () => {
    const { Host, launcher, attempts } = await freshHost(0);
    render(<Host />);
    act(() => launcher.openSupportReport({ kind: 'FEEDBACK' }));
    // Nothing suspends or flashes while the chunk loads.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      await screen.findByRole('dialog', { name: 'FEEDBACK' }),
    ).toBeTruthy();

    act(() => launcher.closeSupportReport());
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => launcher.openSupportReport({ kind: 'PROBLEM' }));
    // Loaded: the second open renders in the same commit.
    expect(screen.getByRole('dialog', { name: 'PROBLEM' })).toBeTruthy();
    expect(attempts.count).toBe(1);
  });

  it('renders nothing, does not throw and closes the request when the chunk fails', async () => {
    const { Host, launcher, attempts } = await freshHost(2);
    const { container } = render(<Host />);
    expect(() =>
      act(() => launcher.openSupportReport({ kind: 'FEEDBACK' })),
    ).not.toThrow();
    // One more attempt, then the request is closed so a later tap works.
    await waitFor(() =>
      expect(launcher.currentSupportReportRequest()).toBeNull(),
    );
    expect(attempts.count).toBe(2);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('retries once on its own when the first load fails', async () => {
    const { Host, launcher, attempts } = await freshHost(1);
    render(<Host />);
    act(() => launcher.openSupportReport({ kind: 'FEEDBACK' }));
    expect(
      await screen.findByRole('dialog', { name: 'FEEDBACK' }),
    ).toBeTruthy();
    expect(attempts.count).toBe(2);
  });

  it('loads the chunk anew on the next request after a failed load', async () => {
    const { Host, launcher, attempts } = await freshHost(2);
    render(<Host />);
    act(() => launcher.openSupportReport({ kind: 'FEEDBACK' }));
    await waitFor(() =>
      expect(launcher.currentSupportReportRequest()).toBeNull(),
    );

    // The next tap, for example once the device is online again.
    act(() => launcher.openSupportReport({ kind: 'PROBLEM' }));
    expect(await screen.findByRole('dialog', { name: 'PROBLEM' })).toBeTruthy();
    expect(attempts.count).toBe(3);
  });
});
