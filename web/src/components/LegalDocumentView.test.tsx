// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import en from '../i18n/locales/en.json';
import legal from '../i18n/locales/legal';
import { privacyPolicyDe } from '../i18n/locales/legalDocuments/privacyPolicy.de.generated';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';
import { LegalDocumentView } from './LegalDocumentView';

// The documents link to each other, so they render inside the app router.
function inRouter(children: ReactNode) {
  return render(<MemoryRouter>{children}</MemoryRouter>);
}

describe('LegalDocumentView', () => {
  afterEach(async () => {
    await i18n.changeLanguage('de');
  });

  it('renders the canonical German text without a language notice in German', () => {
    inRouter(<LegalDocumentView document={termsOfUseDe} />);

    expect(screen.getByRole('article')).toHaveProperty('lang', 'de-DE');
    expect(
      screen.getByRole('heading', { level: 1, name: termsOfUseDe.title }),
    ).toBeDefined();
    expect(screen.getByText(legal.draftBadge)).toBeDefined();
    expect(
      screen.queryByText(
        new RegExp(legal.documentLanguageNotice.split('{{')[0].trim()),
      ),
    ).toBeNull();
  });

  it('names the binding document language instead of implying a translation', async () => {
    await i18n.changeLanguage('en');
    inRouter(<LegalDocumentView document={privacyPolicyDe} />);

    const notice = screen.getByText(
      en.legal.documentLanguageNotice.replace('{{language}}', 'German'),
    );
    expect(notice).toHaveProperty('lang', 'en');
    expect(screen.getByText(en.legal.draftBadge)).toHaveProperty('lang', 'en');
    expect(screen.getByRole('article')).toHaveProperty('lang', 'de-DE');
    expect(
      screen.getByRole('heading', { level: 1, name: privacyPolicyDe.title }),
    ).toBeDefined();
  });

  it('links the terms to the privacy policy inside the app', () => {
    inRouter(<LegalDocumentView document={termsOfUseDe} />);

    expect(
      screen.getByRole('link', { name: 'Datenschutzhinweisen' }),
    ).toHaveProperty('pathname', '/legal/privacy');
  });

  it('lets a form surface open in-app references in place', () => {
    inRouter(
      <LegalDocumentView
        document={termsOfUseDe}
        renderInternalLink={({ href, text }) => (
          <button type="button" data-href={href}>
            {text}
          </button>
        )}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: 'Datenschutzhinweisen' })
        .getAttribute('data-href'),
    ).toBe('/legal/privacy');
    expect(screen.queryByRole('link', { name: 'Datenschutzhinweisen' })).toBe(
      null,
    );
  });

  it('keeps unresolved operator facts visible in the privacy draft', () => {
    inRouter(<LegalDocumentView document={privacyPolicyDe} />);

    expect(privacyPolicyDe.status).toBe('draft');
    expect(privacyPolicyDe.placeholders).toContain(
      'SPECIAL_CATEGORY_LEGAL_BASIS',
    );
    expect(
      screen.getByText(
        legal.placeholder.replace('{{name}}', 'SPECIAL_CATEGORY_LEGAL_BASIS'),
      ),
    ).toBeDefined();
  });
});
