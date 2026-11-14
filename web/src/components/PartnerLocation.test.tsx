// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { PartnerLocationSettingsView } from '../api/generated/models/PartnerLocationSettingsView';
import { resetPartnerLocationOnboardingMemory } from '../client/partnerLocation';
import { PARTNER_LOCATION_MAP_ROUTE } from '../client/routes';
import { postSnackbar } from '../client/snackbar';
import copy from '../i18n/locales/partnerLocation';
import { PartnerLocationOnboarding } from './PartnerLocationOnboarding';
import { PartnerLocationSettingsPage } from './PartnerLocationSettingsPage';
import { PartnerLocationSync } from './PartnerLocationSync';

const env = vi.hoisted(() => ({
  online: true,
  native: false,
  capabilities: ['presence.location'] as string[],
  settings: null as unknown as PartnerLocationSettingsView,
  permission: 'prompt' as string,
  background: { permission: 'unsupported', enabled: false },
}));

const location = vi.hoisted(() => ({
  locationPermission: vi.fn(async () => env.permission),
  requestLocationPermission: vi.fn(async () => 'granted'),
  publishOwnPositionIfDue: vi.fn(async () => null),
  backgroundLocationStatus: vi.fn(async () => env.background),
  requestBackgroundLocationPermission: vi.fn(async () => 'granted'),
  enableBackgroundSharing: vi.fn(async () => {}),
  disableBackgroundSharing: vi.fn(async () => {}),
  openLocationSettings: vi.fn(async () => true),
  usesNativeLocationSettings: vi.fn(() => env.native),
  syncBackgroundSharing: vi.fn(async () => 'unchanged'),
  clearPublicationMemory: vi.fn(),
}));

const api = vi.hoisted(() => ({
  getPartnerLocationSettings: vi.fn(async () => env.settings),
  updatePartnerLocationSettings: vi.fn(
    async (request: {
      partnerLocationSettingsUpdate: {
        level: string;
        indefinite?: boolean;
        expiresAt?: Date | null;
      };
    }) => {
      const update = request.partnerLocationSettingsUpdate;
      env.settings = {
        ...env.settings,
        level: update.level as PartnerLocationSettingsView['level'],
        state: update.level === 'OFF' ? 'OFF' : 'ACTIVE',
        indefinite: Boolean(update.indefinite),
        expiresAt: update.expiresAt ?? null,
        generation: env.settings.generation + 1,
      };
      return env.settings;
    },
  ),
}));

vi.mock('../client/approximateLocation', () => location);
vi.mock('../api/generated/apis/PartnerLocationApi', () => ({
  PartnerLocationApi: class {
    getPartnerLocationSettings = api.getPartnerLocationSettings;
    updatePartnerLocationSettings = api.updatePartnerLocationSettings;
  },
}));
vi.mock('../api/generated/apis/SpacesApi', () => ({
  SpacesApi: class {
    getSpaceApiV1SpacesSpaceIdGet = async () => ({
      id: 'space-1',
      partners: [
        { id: 'account-1', displayName: 'Lea Example' },
        { id: 'account-2', displayName: 'Alex Example' },
      ],
    });
  },
}));
vi.mock('../api/generated/apis/EntitlementsApi', () => ({
  EntitlementsApi: class {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet = async () => ({
      spaceId: 'space-1',
      tier: env.capabilities.length ? 'PREMIUM' : 'FREE',
      status: 'ACTIVE',
      isInGracePeriod: false,
      capabilities: env.capabilities,
    });
  },
}));
vi.mock('../client/connectivity', () => ({
  isClientOnline: () => env.online,
}));
vi.mock('../client/useDocumentLeaveGuard', () => ({
  useDocumentLeaveBlocked: () => false,
}));
vi.mock('../client/snackbar', () => ({ postSnackbar: vi.fn() }));

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Matches localized copy that starts a longer accessible name. */
const startsWith = (value: string) => new RegExp(`^${escapeRegExp(value)}`);
/** The active-share status line before its interpolated end time. */
const activeUntil = new RegExp(
  escapeRegExp(copy.statusActiveUntil.split('{{end}}')[0]),
);
const forPartner = (value: string) => value.replaceAll('{{partner}}', 'Alex');

const owner = {
  apiBaseUrl: 'https://api.example',
  accessToken: 'token',
  spaceId: 'space-1',
};
const account = { id: 'account-1' } as Parameters<
  typeof PartnerLocationSettingsPage
>[0]['account'];
let storage: Map<string, string>;

function view(
  overrides: Partial<PartnerLocationSettingsView> = {},
): PartnerLocationSettingsView {
  return {
    available: true,
    level: 'OFF',
    state: 'OFF',
    indefinite: false,
    expiresAt: null,
    generation: 0,
    lastPublishedAt: null,
    ...overrides,
  };
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  env.online = true;
  env.native = false;
  env.capabilities = ['presence.location'];
  env.settings = view();
  env.permission = 'prompt';
  env.background = { permission: 'unsupported', enabled: false };
  storage = new Map();
  resetPartnerLocationOnboardingMemory();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((media: string) => ({
      matches: media === '(prefers-reduced-motion: reduce)',
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

function renderSettings() {
  return render(
    wrap(<PartnerLocationSettingsPage {...owner} account={account} />),
  );
}

describe('PartnerLocationSettingsPage', () => {
  it('explains Pro calmly without level choices or partner sharing hints', async () => {
    env.capabilities = [];
    env.settings = view({ available: false });
    renderSettings();
    expect(await screen.findByText(copy.proTitle)).toBeTruthy();
    expect(screen.getByText(copy.proBody)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: copy.stop })).toBeNull();
    expect(
      screen.queryByRole('link', { name: copy.distanceOpenMap }),
    ).toBeNull();
  });

  it('links straight to the map once sharing can be chosen', async () => {
    renderSettings();
    const link = await screen.findByRole('link', {
      name: copy.distanceOpenMap,
    });
    expect(link.getAttribute('href')).toBe(PARTNER_LOCATION_MAP_ROUTE);
  });

  it('keeps Stop available without Pro for a suspended share', async () => {
    env.capabilities = [];
    env.settings = view({
      available: false,
      level: 'DISTANCE',
      state: 'SUSPENDED',
      generation: 3,
    });
    renderSettings();
    expect(await screen.findByText(copy.statusSuspended)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.stop }));
    await waitFor(() =>
      expect(api.updatePartnerLocationSettings).toHaveBeenCalledWith({
        spaceId: 'space-1',
        partnerLocationSettingsUpdate: { level: 'OFF' },
      }),
    );
    expect(location.disableBackgroundSharing).toHaveBeenCalled();
    expect(postSnackbar).toHaveBeenCalledWith('partnerLocation.stopped');
  });

  it('confirms a wider share and asks the OS only after confirmation', async () => {
    renderSettings();
    fireEvent.click(
      await screen.findByRole('radio', {
        name: startsWith(copy.levelDistance),
      }),
    );
    const sheet = await screen.findByRole('dialog', {
      name: copy.confirmDistanceTitle,
    });
    expect(location.requestLocationPermission).not.toHaveBeenCalled();
    expect(
      within(sheet).getByRole('radio', { name: copy.durationEvening }),
    ).toHaveProperty('checked', true);
    fireEvent.click(
      within(sheet).getByRole('button', { name: copy.confirmShare }),
    );
    await waitFor(() =>
      expect(api.updatePartnerLocationSettings).toHaveBeenCalled(),
    );
    expect(
      location.requestLocationPermission.mock.invocationCallOrder[0],
    ).toBeLessThan(
      api.updatePartnerLocationSettings.mock.invocationCallOrder[0],
    );
    const update =
      api.updatePartnerLocationSettings.mock.calls[0][0]
        .partnerLocationSettingsUpdate;
    expect(update.level).toBe('DISTANCE');
    expect(update.indefinite).toBe(false);
    expect(update.expiresAt).toBeInstanceOf(Date);
    expect(location.publishOwnPositionIfDue).toHaveBeenCalled();
    expect(postSnackbar).toHaveBeenCalledWith('partnerLocation.shared');
  });

  it('stores nothing when the location permission is refused', async () => {
    location.requestLocationPermission.mockResolvedValueOnce('denied');
    renderSettings();
    fireEvent.click(
      await screen.findByRole('radio', {
        name: startsWith(copy.levelDistance),
      }),
    );
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(
      within(sheet).getByRole('button', { name: copy.confirmShare }),
    );
    expect(await within(sheet).findByRole('alert')).toHaveProperty(
      'textContent',
      copy.permissionNeeded,
    );
    expect(api.updatePartnerLocationSettings).not.toHaveBeenCalled();
  });

  it('narrows immediately and keeps the existing end', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    env.settings = view({
      level: 'DISTANCE_AND_MAP',
      state: 'ACTIVE',
      expiresAt,
      generation: 2,
    });
    renderSettings();
    expect(await screen.findByText(activeUntil)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('radio', { name: startsWith(copy.levelDistance) }),
    );
    await waitFor(() =>
      expect(api.updatePartnerLocationSettings).toHaveBeenCalledWith({
        spaceId: 'space-1',
        partnerLocationSettingsUpdate: {
          level: 'DISTANCE',
          indefinite: false,
          expiresAt,
        },
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hides the background toggle in browsers', async () => {
    env.settings = view({
      level: 'DISTANCE',
      state: 'ACTIVE',
      indefinite: true,
    });
    renderSettings();
    expect(await screen.findByText(copy.statusActiveIndefinite)).toBeTruthy();
    expect(await screen.findByText(copy.deviceTitleBrowser)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(copy.permissionChangeBrowser)).toBeTruthy();
  });

  it('shows the prominent disclosure before the Android background step', async () => {
    env.native = true;
    env.permission = 'granted';
    env.background = { permission: 'prompt', enabled: false };
    env.settings = view({
      level: 'DISTANCE',
      state: 'ACTIVE',
      indefinite: true,
    });
    renderSettings();
    const toggle = await screen.findByRole('switch', {
      name: copy.backgroundLabel,
    });
    expect(screen.getByText(copy.deviceTitleApp)).toBeTruthy();
    expect(screen.queryByText(copy.permissionChangeBrowser)).toBeNull();

    fireEvent.click(toggle);
    let sheet = await screen.findByRole('dialog', {
      name: copy.disclosureTitle,
    });
    expect(
      within(sheet).getByText(forPartner(copy.disclosureBody)),
    ).toBeTruthy();
    expect(
      within(sheet).getByText(forPartner(copy.disclosurePurpose)),
    ).toBeTruthy();
    fireEvent.click(
      within(sheet).getByRole('button', {
        name: copy.disclosureForegroundOnly,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(location.requestBackgroundLocationPermission).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    sheet = await screen.findByRole('dialog', { name: copy.disclosureTitle });
    fireEvent.click(
      within(sheet).getByRole('button', { name: copy.disclosureContinue }),
    );
    await waitFor(() =>
      expect(location.enableBackgroundSharing).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: 'space-1',
          instance: owner.apiBaseUrl,
        }),
      ),
    );
    expect(
      location.requestBackgroundLocationPermission.mock.invocationCallOrder[0],
    ).toBeLessThan(
      location.enableBackgroundSharing.mock.invocationCallOrder[0],
    );
  });
});

function renderOnboarding(ready = true) {
  return render(
    wrap(
      <PartnerLocationOnboarding
        {...owner}
        accountId="account-1"
        ready={ready}
      />,
    ),
  );
}

describe('PartnerLocationOnboarding', () => {
  it('waits for the push prompt before reading anything', async () => {
    renderOnboarding(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.getPartnerLocationSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never appears without the Pro capability', async () => {
    env.capabilities = [];
    renderOnboarding();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.getPartnerLocationSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('remembers "Not now" without the OS dialog', async () => {
    renderOnboarding();
    const sheet = await screen.findByRole('dialog', {
      name: copy.onboardingTitle,
    });
    expect(
      within(sheet).getByText(forPartner(copy.onboardingIntro)),
    ).toBeTruthy();
    fireEvent.click(
      within(sheet).getByRole('button', { name: copy.onboardingLater }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(location.requestLocationPermission).not.toHaveBeenCalled();
    expect(api.updatePartnerLocationSettings).not.toHaveBeenCalled();
    expect([...storage.values()]).toEqual(['answered']);
  });

  it('shares the chosen level only after the OS permission', async () => {
    renderOnboarding();
    const sheet = await screen.findByRole('dialog', {
      name: copy.onboardingTitle,
    });
    fireEvent.click(
      within(sheet).getByRole('radio', { name: copy.levelMapShort }),
    );
    fireEvent.click(
      within(sheet).getByRole('button', { name: copy.onboardingShare }),
    );
    await waitFor(() =>
      expect(api.updatePartnerLocationSettings).toHaveBeenCalled(),
    );
    expect(location.requestLocationPermission).toHaveBeenCalledTimes(1);
    expect(
      api.updatePartnerLocationSettings.mock.calls[0][0]
        .partnerLocationSettingsUpdate.level,
    ).toBe('DISTANCE_AND_MAP');
    expect(postSnackbar).toHaveBeenCalledWith('partnerLocation.sharedMap');
  });

  it('stays answered when a share already exists', async () => {
    env.settings = view({
      level: 'DISTANCE',
      state: 'ACTIVE',
      indefinite: true,
    });
    renderOnboarding();
    await waitFor(() => expect([...storage.values()]).toEqual(['answered']));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PartnerLocationSync', () => {
  function renderSync() {
    return render(
      wrap(<PartnerLocationSync {...owner} accountId="account-1" />),
    );
  }

  it('syncs background updates and publishes while sharing is active', async () => {
    env.settings = view({
      level: 'DISTANCE',
      state: 'ACTIVE',
      indefinite: true,
    });
    const { unmount } = renderSync();
    await waitFor(() =>
      expect(location.publishOwnPositionIfDue).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: 'space-1',
          accountId: 'account-1',
          settings: env.settings,
        }),
      ),
    );
    expect(location.syncBackgroundSharing).toHaveBeenCalledWith(
      expect.objectContaining({ instance: owner.apiBaseUrl }),
    );
    unmount();
    expect(location.clearPublicationMemory).toHaveBeenCalled();
  });

  it('stays idle without Pro and without background updates', async () => {
    env.capabilities = [];
    renderSync();
    await waitFor(() =>
      expect(location.backgroundLocationStatus).toHaveBeenCalled(),
    );
    expect(api.getPartnerLocationSettings).not.toHaveBeenCalled();
    expect(location.publishOwnPositionIfDue).not.toHaveBeenCalled();
  });

  it('still stops background updates after Pro ends', async () => {
    env.capabilities = [];
    env.native = true;
    env.background = { permission: 'granted', enabled: true };
    env.settings = view({ level: 'DISTANCE', state: 'SUSPENDED' });
    renderSync();
    await waitFor(() =>
      expect(location.syncBackgroundSharing).toHaveBeenCalledWith(
        expect.objectContaining({ settings: env.settings }),
      ),
    );
    expect(location.publishOwnPositionIfDue).not.toHaveBeenCalled();
  });
});
