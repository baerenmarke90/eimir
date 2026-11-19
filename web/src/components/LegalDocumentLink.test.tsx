// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import legal from '../i18n/locales/legal';
import { termsOfUseDe } from '../i18n/locales/legalDocuments/termsOfUse.de.generated';
import { LegalDocumentLink, LegalFooterLinks } from './LegalDocumentLink';

// The terms' cross-reference to the privacy policy, read from the generated text.
const TERMS_PRIVACY_REFERENCE =
  termsOfUseDe.blocks
    .flatMap((block) => (block.kind === 'paragraph' ? block.content : []))
    .flatMap((run) =>
      run.kind === 'link' && run.href === '/legal/privacy' ? [run.text] : [],
    )[0] ?? '';

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderAt(children: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      {children}
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
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
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
});

describe('LegalDocumentLink', () => {
  it('follows a cross-reference in a nested sheet without leaving the task', async () => {
    renderAt(<LegalDocumentLink documentId="terms" />);

    fireEvent.click(screen.getByRole('link', { name: legal.termsLink }));
    const terms = await screen.findByRole('dialog', {
      name: legal.termsSheetTitle,
    });
    fireEvent.click(
      within(terms).getByRole('link', { name: TERMS_PRIVACY_REFERENCE }),
    );

    const privacy = await screen.findByRole('dialog', {
      name: legal.privacySheetTitle,
    });
    expect(screen.getByTestId('location').textContent).toBe('/');

    fireEvent.click(
      within(privacy).getByRole('button', { name: legal.privacySheetClose }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(
      screen.queryByRole('dialog', { name: legal.privacySheetTitle }),
    ).toBeNull();
    expect(
      screen.getByRole('dialog', { name: legal.termsSheetTitle }),
    ).toBeDefined();
  });

  it('leaves a modified click to the browser', () => {
    renderAt(<LegalDocumentLink documentId="privacy" />);

    const link = screen.getByRole('link', { name: legal.privacyLink });
    expect(link.getAttribute('href')).toBe('/legal/privacy');
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('LegalFooterLinks', () => {
  it('navigates to the public pages from the app shell', () => {
    renderAt(<LegalFooterLinks className="more-legal" />);

    const footer = screen.getByRole('navigation', { name: legal.eyebrow });
    fireEvent.click(
      within(footer).getByRole('link', { name: legal.privacyLink }),
    );
    expect(screen.getByTestId('location').textContent).toBe('/legal/privacy');
  });

  it('opens the texts in place where a form may hold input', async () => {
    renderAt(<LegalFooterLinks className="login-legal" inPlace />);

    fireEvent.click(screen.getByRole('link', { name: legal.privacyLink }));
    expect(
      await screen.findByRole('dialog', { name: legal.privacySheetTitle }),
    ).toBeDefined();
    expect(screen.getByTestId('location').textContent).toBe('/');
  });
});
