// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

import de from '../i18n/locales/de';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.doUnmock('./LegalDocumentContent');
  vi.resetModules();
});

async function loadText() {
  return (await import('./LegalDocumentText')).LegalDocumentText;
}

describe('LegalDocumentText', () => {
  it('shows the offline state with a reload when the text chunk cannot load', async () => {
    vi.resetModules();
    vi.doMock('./LegalDocumentContent', () => {
      throw new Error('chunk unavailable');
    });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const LegalDocumentText = await loadText();
    render(
      <MemoryRouter>
        <LegalDocumentText documentId="terms" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status').textContent).toContain(
      de.states.loading.title,
    );
    const retry = await screen.findByRole(
      'button',
      { name: de.common.retry },
      // The rejected dynamic import can take longer on a loaded runner.
      { timeout: 10_000 },
    );
    expect(screen.getByText(de.states.offline.title)).toBeDefined();
    fireEvent.click(retry);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('renders a preloaded text in the first frame without a loading state', async () => {
    vi.resetModules();
    const module = await import('./LegalDocumentText');
    await act(() => module.preloadLegalDocumentContent());
    render(
      <MemoryRouter>
        <module.LegalDocumentText documentId="terms" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: termsOfUseDe.title }),
    ).toBeDefined();
  });
});
