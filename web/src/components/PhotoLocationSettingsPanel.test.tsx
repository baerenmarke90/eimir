// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AccountApi } from '../api/generated/apis/AccountApi';
import photoLocations from '../i18n/locales/photoLocations';
import { PhotoLocationSettingsPanel } from './PhotoLocationSettingsPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <PhotoLocationSettingsPanel
        apiBaseUrl="https://api.example.test"
        accessToken="test-token"
        accountId="account-a"
      />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

it('shows the real server value and saves the opposite value with its version', async () => {
  vi.spyOn(
    AccountApi.prototype,
    'getPhotoLocationPreferences',
  ).mockResolvedValue({ enabled: true, version: 3 });
  const save = vi
    .spyOn(AccountApi.prototype, 'updatePhotoLocationPreferences')
    .mockResolvedValue({ enabled: false, version: 4 });
  mount();
  const control = await screen.findByRole('switch', {
    name: photoLocations.enabledLabel,
  });
  expect(control.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(control);
  await waitFor(() =>
    expect(control.getAttribute('aria-checked')).toBe('false'),
  );
  expect(save).toHaveBeenCalledWith({
    ifMatch: '"3"',
    photoLocationPreferencesUpdate: { enabled: false },
  });
});

it('retains the confirmed state after a failed write', async () => {
  vi.spyOn(
    AccountApi.prototype,
    'getPhotoLocationPreferences',
  ).mockResolvedValue({ enabled: false, version: 3 });
  vi.spyOn(
    AccountApi.prototype,
    'updatePhotoLocationPreferences',
  ).mockRejectedValue(new Error('Connection failed'));
  mount();
  const control = await screen.findByRole('switch');
  fireEvent.click(control);
  await waitFor(() =>
    expect(screen.queryByText(photoLocations.saved)).toBeNull(),
  );
  await waitFor(() => expect(control.hasAttribute('disabled')).toBe(false));
  expect(control.getAttribute('aria-checked')).toBe('false');
});

it('does not repopulate a removed account query after a late response', async () => {
  vi.spyOn(
    AccountApi.prototype,
    'getPhotoLocationPreferences',
  ).mockResolvedValue({ enabled: true, version: 3 });
  let resolve: (value: { enabled: boolean; version: number }) => void =
    () => {};
  vi.spyOn(
    AccountApi.prototype,
    'updatePhotoLocationPreferences',
  ).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { client, unmount } = mount();
  fireEvent.click(await screen.findByRole('switch'));
  const key = [
    'photo-location-preferences',
    'https://api.example.test',
    'account-a',
  ];
  await waitFor(() =>
    expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true),
  );
  unmount();
  client.removeQueries({ queryKey: key });
  resolve({ enabled: false, version: 4 });
  await new Promise((done) => setTimeout(done, 0));
  expect(client.getQueryData(key)).toBeUndefined();
});
