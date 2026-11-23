// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { privacyPolicyDe } from '../i18n/locales/legalDocuments/privacyPolicy.de.generated';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';
import { legalDocumentVersions } from '../i18n/locales/legalDocuments/versions.generated';
import { LegalDocumentPage } from './LegalDocumentPage';
import { BUNDLED_TERMS_VERSION } from './TermsAcceptanceField';

beforeAll(() => {
  window.scrollTo = vi.fn();
});

afterEach(cleanup);

// MemoryRouter reports POP for its initial entry, like a reload or Back; a
// link click is an in-app PUSH entry.
function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/" element={<Link to="/legal/terms">terms</Link>} />
        <Route
          path="/legal/terms"
          element={<LegalDocumentPage documentId="terms" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LegalDocumentPage', () => {
  it('focuses the title once the on-demand text appears after an in-app link', async () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('link', { name: 'terms' }));

    const title = await screen.findByRole(
      'heading',
      {
        level: 1,
        name: termsOfUseDe.title,
      },
      // The text arrives from a dynamic import, slower on a loaded runner.
      { timeout: 10_000 },
    );
    expect(document.activeElement).toBe(title);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('shows the on-demand text without moving focus on a history entry', async () => {
    renderAt('/legal/terms');

    const title = await screen.findByRole(
      'heading',
      {
        level: 1,
        name: termsOfUseDe.title,
      },
      // The text arrives from a dynamic import, slower on a loaded runner.
      { timeout: 10_000 },
    );
    expect(title.id).toBe('legal-page-title');
    expect(document.activeElement).not.toBe(title);
  });
});

describe('legal document versions', () => {
  it('match the bundled texts without loading them at startup', () => {
    expect(BUNDLED_TERMS_VERSION).toBe(termsOfUseDe.version);
    expect(legalDocumentVersions).toEqual({
      termsOfUseDe: termsOfUseDe.version,
      privacyPolicyDe: privacyPolicyDe.version,
    });
  });
});
