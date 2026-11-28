// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { PersonColoursProvider } from '../client/personColoursContext';
import personColours from '../i18n/locales/personColours';
import { PersonColoursSettings } from './PersonColoursSettings';
import germanUi from '../i18n/locales/de';

const ACCOUNT_ID = 'account-1';
const SPACE_ID = 'space-1';

function json(colours: string | null, version: number) {
  return {
    raw: new Response(JSON.stringify({ colours, version }), {
      status: 200,
      headers: { ETag: `"${version}"`, 'Content-Type': 'application/json' },
    }),
  };
}

function renderSettings(
  api: Record<string, unknown>,
  options: { pro?: boolean } = {},
) {
  const entitlements = {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: vi.fn(async () => ({
      capabilities: options.pro === false ? [] : ['theme.bespoke_packs'],
    })),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PersonColoursProvider
        api={api as unknown as AppearanceApi}
        entitlementsApi={entitlements as unknown as EntitlementsApi}
        instance="https://api.example.test"
        accountId={ACCOUNT_ID}
        spaceId={SPACE_ID}
      >
        <MemoryRouter>
          <PersonColoursSettings />
        </MemoryRouter>
      </PersonColoursProvider>
    </QueryClientProvider>,
  );
}

async function openSheet() {
  fireEvent.click(await screen.findByText(personColours.change));
  await screen.findByRole('group', { name: personColours.choices });
}

const pairNameText = (own: string, partner: string) =>
  personColours.pair.replace('{{own}}', own).replace('{{partner}}', partner);

const pairName = (own: string, partner: string) =>
  new RegExp(`${own} \\+ ${partner}`);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('Settings > Appearance: person colour pair (Product Owner decision 2026-11-16)', () => {
  it('offers automatic plus the fixed pairs, starts on automatic and names both colours in words', async () => {
    renderSettings({
      getPersonColoursPreferenceRaw: vi.fn(async () => json(null, 0)),
    });

    await openSheet();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(9);
    expect(radios[0].checked).toBe(true);
    expect(
      screen.getByRole('radio', {
        name: pairName(personColours.tone.rose, personColours.tone.deeprose),
      }),
    ).toBeDefined();
    expect(screen.getByText(personColours.help)).toBeDefined();
    expect(screen.getByText(personColours.order)).toBeDefined();
    const save = screen.getByRole('button', {
      name: personColours.selected,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('saves only the colour pair through the personal appearance endpoint and recolours the app', async () => {
    const update = vi.fn(async () => json('rose_deeprose', 1));
    renderSettings({
      getPersonColoursPreferenceRaw: vi.fn(async () => json(null, 0)),
      updatePersonColoursPreferenceRaw: update,
    });
    await openSheet();

    fireEvent.click(
      screen.getByRole('radio', {
        name: pairName(personColours.tone.rose, personColours.tone.deeprose),
      }),
    );
    const save = await screen.findByRole('button', {
      name: germanUi.common.save,
    });
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(save);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      ifMatch: '"0"',
      personColoursPreferencePatch: { colours: 'rose_deeprose' },
    });
    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue('--person-own-accent'),
      ).toBe('var(--color-person-rose)'),
    );
    expect(
      document.documentElement.style.getPropertyValue(
        '--person-partner-accent',
      ),
    ).toBe('var(--color-person-deeprose)');
    await screen.findByText(personColours.saved);
  });

  it('keeps the choice and shows a message when the pair cannot be saved', async () => {
    renderSettings({
      getPersonColoursPreferenceRaw: vi.fn(async () => json(null, 0)),
      updatePersonColoursPreferenceRaw: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    await openSheet();

    fireEvent.click(screen.getAllByRole('radio')[2] as HTMLInputElement);
    const save = await screen.findByRole('button', {
      name: germanUi.common.save,
    });
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(save);

    await screen.findByText(personColours.saveError);
    expect((screen.getAllByRole('radio')[2] as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('summarises the current choice before the sheet opens', async () => {
    renderSettings({
      getPersonColoursPreferenceRaw: vi.fn(async () =>
        json('blue_deepblue', 3),
      ),
    });

    expect(
      await screen.findByText(
        pairNameText(personColours.tone.blue, personColours.tone.deepblue),
      ),
    ).toBeDefined();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('offers Pro instead of saving when a pair is chosen without Pro, and keeps Automatic free', async () => {
    const update = vi.fn(async () => json(null, 1));
    renderSettings(
      {
        getPersonColoursPreferenceRaw: vi.fn(async () => json(null, 0)),
        updatePersonColoursPreferenceRaw: update,
      },
      { pro: false },
    );
    await openSheet();

    fireEvent.click(screen.getAllByRole('radio')[2] as HTMLInputElement);
    expect(
      await screen.findByRole('button', { name: personColours.discover }),
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: germanUi.common.save }),
    ).toBeNull();
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('radio')[0] as HTMLInputElement);
    expect(
      screen.queryByRole('button', { name: personColours.discover }),
    ).toBeNull();
  });

  it('marks every pair as Pro and leaves Automatic unmarked', async () => {
    renderSettings({
      getPersonColoursPreferenceRaw: vi.fn(async () => json(null, 0)),
    });
    await openSheet();

    expect(screen.getAllByText(personColours.pro)).toHaveLength(8);
  });

  it('shows nothing outside a signed-in Space', () => {
    render(<PersonColoursSettings />);
    expect(screen.queryByText(personColours.change)).toBeNull();
  });
});
