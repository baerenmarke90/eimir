// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ApiRuntimeProvider } from '../client/apiRuntimeContext';
import {
  clearFailureReference,
  recordRequestFailure,
} from '../client/failureReference';
import { ClientProblemError } from '../client/problemDetails';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import de from '../i18n/locales/de';
import supportReport from '../i18n/locales/supportReport';
import { ProblemState } from './ProblemState';

const API = 'http://api.example.test';

function withSession(
  children: ReactNode,
  { available = true, signedIn = true } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['instance-status', API], {
    supportReportsAvailable: available,
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

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  clearFailureReference();
  window.localStorage.clear();
});

describe('ProblemState', () => {
  it('offers the canonical public start for an expired session', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ProblemState error={new ClientProblemError('unauthorized', 401)} />
      </MemoryRouter>,
    );

    expect(html).toContain(`href="${PUBLIC_START_ROUTE}"`);
    expect(html).toContain(`>${de.common.backToStart}<`);
  });

  it('does not turn a permission error into a session-reset action', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ProblemState error={new ClientProblemError('permission', 403)} />
      </MemoryRouter>,
    );

    expect(html).not.toContain(de.common.backToStart);
  });

  it.each([
    ['server', 500],
    ['unknown', undefined],
    ['validation', 422],
    ['conflict', 409],
  ] as const)(
    'offers a quiet report action below the retry for %s',
    (kind, status) => {
      render(
        withSession(
          <ProblemState
            error={new ClientProblemError(kind, status)}
            onRetry={() => {}}
          />,
        ),
      );
      const retry = screen.getByRole('button', { name: de.common.retry });
      const report = screen.getByRole('button', {
        name: supportReport.action,
      });
      expect(report.classList.contains('tertiary')).toBe(true);
      expect(
        retry.compareDocumentPosition(report) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it('opens the sheet with the failure shown at that moment', () => {
    recordRequestFailure({
      method: 'PUT',
      routeTemplate: '/api/v1/memories/123',
      status: 500,
    });
    render(
      withSession(
        <ProblemState error={new ClientProblemError('server', 500)} />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: supportReport.action }));
    const dialog = screen.getByRole('dialog', {
      name: supportReport.title.PROBLEM,
    });
    expect(dialog.textContent).toContain('PUT:/api/v1/memories/{id}:500');
  });

  it.each([
    ['unauthorized', 401],
    ['permission', 403],
    ['notFound', 404],
    ['offline', undefined],
    ['rateLimit', 429],
  ] as const)(
    'problem_state_hides_report_action_when_unauthorized (%s)',
    (kind, status) => {
      render(
        withSession(
          <ProblemState
            error={new ClientProblemError(kind, status)}
            onRetry={() => {}}
          />,
        ),
      );
      expect(
        screen.queryByRole('button', { name: supportReport.action }),
      ).toBeNull();
    },
  );

  it('hides the report action without a session, availability or consent', () => {
    const error = new ClientProblemError('server', 500);
    const cases = [
      withSession(<ProblemState error={error} />, { signedIn: false }),
      withSession(<ProblemState error={error} />, { available: false }),
      withSession(<ProblemState error={error} reportable={false} />),
    ];
    for (const tree of cases) {
      const { unmount } = render(tree);
      expect(
        screen.queryByRole('button', { name: supportReport.action }),
      ).toBeNull();
      unmount();
    }
  });
});
