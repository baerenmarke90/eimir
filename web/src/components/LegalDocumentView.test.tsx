// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import en from '../i18n/locales/en.json';
import legal from '../i18n/locales/legal';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';
import { LegalDocumentView } from './LegalDocumentView';

describe('LegalDocumentView', () => {
  afterEach(async () => {
    await i18n.changeLanguage('de');
  });

  it('renders the canonical German text without a language notice in German', () => {
    render(<LegalDocumentView document={termsOfUseDe} />);

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
    render(<LegalDocumentView document={termsOfUseDe} />);

    const notice = screen.getByText(
      en.legal.documentLanguageNotice.replace('{{language}}', 'German'),
    );
    expect(notice).toHaveProperty('lang', 'en');
    expect(screen.getByText(en.legal.draftBadge)).toHaveProperty('lang', 'en');
    expect(
      screen.getByRole('heading', { level: 1, name: termsOfUseDe.title }),
    ).toBeDefined();
  });
});
