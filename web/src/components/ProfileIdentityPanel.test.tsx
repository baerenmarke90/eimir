// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { PartnerProfileView } from '../api/generated/models/PartnerProfileView';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import profileIdentity from '../i18n/locales/profileIdentity';
import { ProfileIdentityPanel } from './ProfileIdentityPanel';
import germanUi from '../i18n/locales/de';

const ACCOUNT_ID = 'account-1';
const SPACE_ID = 'space-1';

function profile(displayName = 'Saved name', version = 1): PartnerProfileView {
  return {
    accountId: ACCOUNT_ID,
    birthday: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    displayName,
    id: 'profile-1',
    preferences: [],
    profileAttachmentId: null,
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    version,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.profileIdentity(SPACE_ID, ACCOUNT_ID),
    profile(),
  );
  const onDisplayNameChanged = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfileIdentityPanel
          apiBaseUrl="https://api.example.test"
          accessToken="token"
          account={{ id: ACCOUNT_ID, displayName: 'Account name' }}
          spaceId={SPACE_ID}
          onDisplayNameChanged={onDisplayNameChanged}
          editRequest={1}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { onDisplayNameChanged };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfileIdentityPanel display-name editing', () => {
  it.each([
    new ClientProblemError('conflict', 409, 'VERSION_CONFLICT'),
    new ClientProblemError('validation', 422, 'DISPLAY_NAME_INVALID'),
    new ClientProblemError('offline'),
  ])('retains and focuses the draft after %s', async (error) => {
    vi.spyOn(ProfilesApi.prototype, 'updateProfileIdentity').mockRejectedValue(
      error,
    );
    renderPanel();

    const input = screen.getByLabelText(
      profileIdentity.displayNameLabel,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My unsaved draft' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(input.value).toBe('My unsaved draft');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(
        'profile-display-name-error',
      );
      expect(document.activeElement).toBe(input);
    });
  });

  it('prevents another submit while pending, then closes only after success', async () => {
    let resolveUpdate: ((value: PartnerProfileView) => void) | undefined;
    const update = vi
      .spyOn(ProfilesApi.prototype, 'updateProfileIdentity')
      .mockImplementation(
        () =>
          new Promise<PartnerProfileView>((resolve) => {
            resolveUpdate = resolve;
          }),
      );
    vi.spyOn(
      ProfilesApi.prototype,
      'getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet',
    ).mockResolvedValue(profile('Updated name', 2));
    const { onDisplayNameChanged } = renderPanel();
    const input = screen.getByLabelText(
      profileIdentity.displayNameLabel,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Updated name' } });
    const form = input.closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(
      screen.getByLabelText(profileIdentity.displayNameLabel),
    ).toBeDefined();
    fireEvent.submit(form);
    expect(update).toHaveBeenCalledTimes(1);

    resolveUpdate?.(profile('Updated name', 2));
    await waitFor(() => {
      expect(
        screen.queryByLabelText(profileIdentity.displayNameLabel),
      ).toBeNull();
      expect(onDisplayNameChanged).toHaveBeenCalledWith('Updated name');
      expect(screen.getByText(profileIdentity.saved)).toBeDefined();
    });
  });

  it('clears an associated error when the draft is corrected and supports retry', async () => {
    vi.spyOn(
      ProfilesApi.prototype,
      'getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet',
    ).mockResolvedValue(profile('Corrected name', 2));
    const update = vi
      .spyOn(ProfilesApi.prototype, 'updateProfileIdentity')
      .mockRejectedValueOnce(new ClientProblemError('conflict', 409))
      .mockResolvedValueOnce(profile('Corrected name', 2));
    renderPanel();

    const input = screen.getByLabelText(
      profileIdentity.displayNameLabel,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'First draft' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(input.getAttribute('aria-invalid')).toBe('true'),
    );

    fireEvent.change(input, { target: { value: 'Corrected name' } });
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByLabelText(profileIdentity.displayNameLabel),
      ).toBeNull(),
    );
  });
});

describe('ProfileIdentityPanel birthday editing', () => {
  it('sets and clears the optional birthday through the profile identity contract', async () => {
    const update = vi
      .spyOn(ProfilesApi.prototype, 'updateProfileIdentity')
      .mockResolvedValueOnce({
        ...profile('Saved name', 2),
        birthday: new Date('1992-05-14T00:00:00Z'),
      })
      .mockResolvedValueOnce(profile('Saved name', 3));
    vi.spyOn(
      ProfilesApi.prototype,
      'getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet',
    ).mockResolvedValue(profile('Saved name', 3));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      authorSummaryQueryKeys.profileIdentity(SPACE_ID, ACCOUNT_ID),
      profile(),
    );

    // The page's actions menu raises an edit request; it opens the editor.
    const panel = (editRequest: number) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfileIdentityPanel
            apiBaseUrl="https://api.example.test"
            accessToken="token"
            account={{ id: ACCOUNT_ID, displayName: 'Account name' }}
            spaceId={SPACE_ID}
            onDisplayNameChanged={vi.fn()}
            editRequest={editRequest}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(panel(1));
    const input = screen.getByLabelText(
      profileIdentity.birthdayLabel,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1992-05-14' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(
      update.mock.calls[0][0].profileIdentityUpdate.birthday
        ?.toISOString()
        .slice(0, 10),
    ).toBe('1992-05-14');

    await waitFor(() =>
      expect(screen.queryByLabelText(profileIdentity.birthdayLabel)).toBeNull(),
    );

    queryClient.setQueryData(
      authorSummaryQueryKeys.profileIdentity(SPACE_ID, ACCOUNT_ID),
      {
        ...profile('Saved name', 2),
        birthday: new Date('1992-05-14T00:00:00Z'),
      },
    );
    view.rerender(panel(2));
    const clearInput = screen.getByLabelText(
      profileIdentity.birthdayLabel,
    ) as HTMLInputElement;
    fireEvent.change(clearInput, { target: { value: '' } });
    fireEvent.submit(clearInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0].profileIdentityUpdate.birthday).toBeNull();
  });
});

describe('ProfileIdentityPanel single edit form', () => {
  it('saves name and birthday in one request and only when something changed', async () => {
    const update = vi
      .spyOn(ProfilesApi.prototype, 'updateProfileIdentity')
      .mockResolvedValue({
        ...profile('New name', 2),
        birthday: new Date('1992-05-14T00:00:00Z'),
      });
    vi.spyOn(
      ProfilesApi.prototype,
      'getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet',
    ).mockResolvedValue(profile('New name', 2));
    renderPanel();

    const save = screen.getByRole('button', {
      name: germanUi.common.save,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(profileIdentity.displayNameLabel), {
      target: { value: 'New name' },
    });
    fireEvent.change(screen.getByLabelText(profileIdentity.birthdayLabel), {
      target: { value: '1992-05-14' },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const body = update.mock.calls[0][0].profileIdentityUpdate;
    expect(body.displayName).toBe('New name');
    expect(body.birthday?.toISOString().slice(0, 10)).toBe('1992-05-14');
  });

  it('closes without saving on cancel', () => {
    const update = vi.spyOn(ProfilesApi.prototype, 'updateProfileIdentity');
    renderPanel();
    fireEvent.change(screen.getByLabelText(profileIdentity.displayNameLabel), {
      target: { value: 'Unsaved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(update).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText(profileIdentity.displayNameLabel),
    ).toBeNull();
  });
});
