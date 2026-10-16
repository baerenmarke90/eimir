// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RelationshipSettingsSection } from './ProfilePageBase';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';

afterEach(() => {
  cleanup();
});

const SPACE_ID = 'test-space-123';

function createMockSpacesApi(
  initialProfile = {
    version: 1,
    relationshipStartedOn: new Date('2022-06-14T00:00:00.000Z'),
    showRelationshipDuration: true,
    durationDisplayMode: 'YEARS_MONTHS',
    relationshipYears: 3,
    relationshipMonths: 2,
    relationshipDays: null,
  },
) {
  const getFn = vi.fn().mockResolvedValue(initialProfile);
  const updateFn = vi
    .fn()
    .mockImplementation(async ({ spaceProfileUpdate }) => {
      return {
        ...initialProfile,
        ...spaceProfileUpdate,
        version: 2,
      };
    });

  return {
    getSpaceProfileApiV1SpacesSpaceIdProfileGet: getFn,
    updateSpaceProfileApiV1SpacesSpaceIdProfilePut: updateFn,
  } as unknown as SpacesApi;
}

function renderSection(spacesApi: SpacesApi) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={['/more/settings/relationship']}>
      <QueryClientProvider client={queryClient}>
        <RelationshipSettingsSection spacesApi={spacesApi} spaceId={SPACE_ID} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('RelationshipSettingsSection', () => {
  it('disables save button when pristine and enables when dirty', async () => {
    const spacesApi = createMockSpacesApi();
    renderSection(spacesApi);

    // Wait for profile data to load
    await waitFor(() => {
      expect(screen.getByLabelText(/Zusammen seit/i)).toBeDefined();
    });

    const saveBtn = screen.getByRole('button', {
      name: /Änderungen speichern/i,
    });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);

    // Toggle duration checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Should now be enabled
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);

    // Toggle back to original state
    fireEvent.click(checkbox);
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits update mutation and displays subtle save feedback', async () => {
    const spacesApi = createMockSpacesApi();
    renderSection(spacesApi);

    await waitFor(() => {
      expect(screen.getByLabelText(/Zusammen seit/i)).toBeDefined();
    });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const saveBtn = screen.getByRole('button', {
      name: /Änderungen speichern/i,
    });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(
        spacesApi.updateSpaceProfileApiV1SpacesSpaceIdProfilePut,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: SPACE_ID,
          ifMatch: '1',
          spaceProfileUpdate: expect.objectContaining({
            showRelationshipDuration: false,
          }),
        }),
      );
    });

    // Subtle feedback should appear
    await waitFor(() => {
      expect(screen.getByText('✓ Gespeichert')).toBeDefined();
    });

    // Subsequent change clears saved feedback and enables save button again
    const currentCheckbox = screen.getByRole('checkbox');
    fireEvent.click(currentCheckbox);
    const currentSaveBtn = screen.getByRole('button', {
      name: /Änderungen speichern/i,
    });
    expect((currentSaveBtn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('✓ Gespeichert')).toBeNull();
  });

  it('renders preview card and notification link', async () => {
    const spacesApi = createMockSpacesApi();
    renderSection(spacesApi);

    await waitFor(() => {
      expect(screen.getByLabelText(/Zusammen seit/i)).toBeDefined();
    });

    expect(screen.getByText(/Vorschau/i)).toBeDefined();
    expect(screen.getByText(/Aktuell/i)).toBeDefined();
    expect(screen.getByText(/Nächster Jahrestag/i)).toBeDefined();

    const notifLink = screen.getByRole('link', {
      name: /Jahrestag-Erinnerungen/,
    });
    expect(notifLink.getAttribute('href')).toBe('/more/settings/notifications');
  });
});
