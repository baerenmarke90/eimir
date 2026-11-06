// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountApi } from '../api/generated/apis/AccountApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { languagePreferenceKey } from '../client/languagePreference';
import { ClientProblemError } from '../client/problemDetails';
import { useAccountLanguage } from '../client/useAccountLanguage';
import { i18n, useTranslation } from '../i18n';
import { LanguageSettings } from './LanguageSettings';

const initial: AccountView = {
  id: 'first',
  displayName: 'First',
  languagePreference: 'auto',
  locale: 'de',
  languageVersion: 0,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Harness() {
  const [account, setAccount] = useState(initial);
  useAccountLanguage('https://instance.test', 'token', account, setAccount);
  const { t } = useTranslation();
  return (
    <>
      <span>{t('navigation.story')}</span>
      <input aria-label="Draft" defaultValue="Untouched words" />
      <LanguageSettings
        apiBaseUrl="https://instance.test"
        accessToken="token"
        accountId={account.id}
      />
    </>
  );
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return client;
}

describe('personal language setting', () => {
  it('saves immediately, translates in place and keeps the existing input and focus', async () => {
    const read = vi.spyOn(AccountApi.prototype, 'getLanguagePreference');
    const write = vi
      .spyOn(AccountApi.prototype, 'setLanguagePreference')
      .mockResolvedValue({
        preference: 'en',
        effectiveLocale: 'en',
        version: 1,
      });
    const client = setup();
    const input = screen.getByLabelText('Draft');
    const user = userEvent.setup();
    await user.type(input, ' and more');
    const select = screen.getByRole('combobox', { name: 'Sprache' });
    await user.selectOptions(select, 'en');
    await screen.findByText('Your language is saved.');
    expect(i18n.resolvedLanguage).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByText('Moments')).toBeTruthy();
    expect(screen.getByLabelText('Draft')).toBe(input);
    expect((input as HTMLInputElement).value).toBe('Untouched words and more');
    expect(document.activeElement).toBe(select);
    expect(read).not.toHaveBeenCalled();
    expect(write.mock.calls[0][0]).toEqual({
      ifMatch: '"0"',
      languagePreferenceUpdate: {
        preference: 'en',
        deviceLanguages: ['de-DE'],
      },
    });
    expect(
      client.getQueryData(
        languagePreferenceKey('https://instance.test', 'first'),
      ),
    ).toEqual({ preference: 'en', effectiveLocale: 'en', version: 1 });
  });

  it('retains a failed selection for deliberate retry and reloads a conflict', async () => {
    const write = vi
      .spyOn(AccountApi.prototype, 'setLanguagePreference')
      .mockRejectedValueOnce(new ClientProblemError('conflict', 409));
    const read = vi
      .spyOn(AccountApi.prototype, 'getLanguagePreference')
      .mockResolvedValue({
        preference: 'de',
        effectiveLocale: 'de',
        version: 2,
      });
    setup();
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Sprache' }),
      'en',
    );
    await screen.findByRole('alert');
    expect(
      (screen.getByRole('combobox', { name: 'Sprache' }) as HTMLSelectElement)
        .value,
    ).toBe('en');
    expect(i18n.resolvedLanguage).toBe('de');
    expect(read).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Aktuelle Auswahl laden' }),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Sprache' }) as HTMLSelectElement)
          .value,
      ).toBe('de'),
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not queue an offline choice for an automatic write later', async () => {
    const write = vi.spyOn(AccountApi.prototype, 'setLanguagePreference');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    setup();
    await userEvent
      .setup()
      .selectOptions(screen.getByRole('combobox', { name: 'Sprache' }), 'en');
    await screen.findByText(i18n.t('languageSettings.offline'));
    expect(write).not.toHaveBeenCalled();
    expect(i18n.resolvedLanguage).toBe('de');
  });
});
