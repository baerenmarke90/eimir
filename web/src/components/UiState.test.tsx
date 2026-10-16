import { renderToStaticMarkup } from 'react-dom/server';
import { UiState } from './UiState';

describe('UiState', () => {
  it('announces loading without exposing implementation details', () => {
    const html = renderToStaticMarkup(
      <UiState kind="loading" title="Loading fixture" />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading fixture');
  });

  it('uses an alert role for error presentation and supports a recovery action', () => {
    const html = renderToStaticMarkup(
      <UiState
        kind="error"
        title="Error fixture"
        body="Safe body"
        action={<button type="button">Retry</button>}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Safe body');
    expect(html).toContain('Retry');
  });
});
