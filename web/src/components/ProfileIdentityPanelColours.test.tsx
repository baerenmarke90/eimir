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
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import type { PartnerProfileView } from '../api/generated/models/PartnerProfileView';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { PersonColoursProvider } from '../client/personColoursContext';
import profileIdentity from '../i18n/locales/profileIdentity';
import { ProfileIdentityPanel } from './ProfileIdentityPanel';

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

function renderPanel(api: Record<string, unknown>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  const profile: PartnerProfileView = {
    accountId: ACCOUNT_ID,
    birthday: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    displayName: 'Saved name',
    id: 'profile-1',
    preferences: [],
    profileAttachmentId: null,
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    version: 1,
  };
  queryClient.setQueryData(
    authorSummaryQueryKeys.profileIdentity(SPACE_ID, ACCOUNT_ID),
    profile,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PersonColoursProvider
          api={api as unknown as AppearanceApi}
          instance="https://api.example.test"
          accountId={ACCOUNT_ID}
          spaceId={SPACE_ID}
        >
          <ProfileIdentityPanel
            apiBaseUrl="https://api.example.test"
            accessToken="token"
            account={{ id: ACCOUNT_ID, displayName: 'Account name' }}
            spaceId={SPACE_ID}
            onDisplayNameChanged={vi.fn()}
          />
        </PersonColoursProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openEditor() {
  fireEvent.click(
    screen.getByRole('button', { name: profileIdentity.editProfile }),
  );
  await screen.findByRole('group', { name: profileIdentity.colours.title });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('profile colour pair (Product Owner decision 2026-11-16)', () => {
  it('offers automatic plus the fixed pairs, names both colours in words and starts on automatic', async () => {
    renderPanel({
      getPersonColoursPreferenceRaw: vi.fn(async () => json(null, 0)),
    });
    await openEditor();

    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(9);
    expect(radios[0].checked).toBe(true);
    expect(
      screen.getByText(
        profileIdentity.colours.pair
          .replace('{{own}}', profileIdentity.colours.tone.rose)
          .replace('{{partner}}', profileIdentity.colours.tone.blue),
      ),
    ).toBeDefined();
    expect(screen.getByText(profileIdentity.colours.help)).toBeDefined();
  });

  it('saves only the colour pair through the personal appearance endpoint and recolours the app', async () => {
    const update = vi.fn(async () => json('rose_deeprose', 1));
    renderPanel({
      getPersonColoursPreferenceRaw: vi.fn(async () => json(null, 0)),
      updatePersonColoursPreferenceRaw: update,
    });
    await openEditor();

    fireEvent.click(
      screen.getByRole('radio', {
        name: new RegExp(
          `${profileIdentity.colours.tone.rose} \\+ ${profileIdentity.colours.tone.deeprose}`,
        ),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: profileIdentity.saveProfile }),
    );

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
    await waitFor(() =>
      expect(screen.getByText(profileIdentity.saved)).toBeDefined(),
    );
  });

  it('keeps the draft and shows a message when the pair cannot be saved', async () => {
    renderPanel({
      getPersonColoursPreferenceRaw: vi.fn(async () => json(null, 0)),
      updatePersonColoursPreferenceRaw: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    await openEditor();

    fireEvent.click(screen.getAllByRole('radio')[2] as HTMLInputElement);
    fireEvent.click(
      screen.getByRole('button', { name: profileIdentity.saveProfile }),
    );

    await screen.findByText(profileIdentity.colours.saveError);
    expect((screen.getAllByRole('radio')[2] as HTMLInputElement).checked).toBe(
      true,
    );
  });
});
