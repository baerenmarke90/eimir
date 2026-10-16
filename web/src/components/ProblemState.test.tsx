import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ClientProblemError } from '../client/problemDetails';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import de from '../i18n/locales/de';
import { ProblemState } from './ProblemState';

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
});
