// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import photoSources from '../i18n/locales/photoSources';
import { GoogleAccountSettings } from './GoogleAccountSettings';

const api = {
  saveGooglePhotoAccount: vi.fn(),
  removeGooglePhotoAccount: vi.fn(),
};
const state = { email: null as string | null, native: true };
const confirm = vi.fn();

vi.mock('../pwa', () => ({ isCapacitorNative: () => state.native }));
vi.mock('../client/photoSources', () => ({
  confirmGoogleAccessInApp: (...args: unknown[]) => confirm(...args),
}));
vi.mock('../client/usePhotoSources', () => ({
  usePhotoSources: () => ({
    apiRef: { current: api },
    availability: {
      googleAvailable: true,
      googleAccountEmail: state.email,
      googleAccountToken: 'absent',
    },
    refreshAvailability: async () => {
      state.email = 'anna@example.test';
    },
  }),
}));

function renderSettings() {
  render(
    <GoogleAccountSettings
      apiBaseUrl="https://eimir.example"
      accessToken="synthetic-token"
      accountId="account"
      spaceId="space"
    />,
  );
}

async function link() {
  fireEvent.click(
    screen.getByRole('button', { name: photoSources.googleAccountLink }),
  );
  fireEvent.change(
    await screen.findByLabelText(photoSources.googleAccountEmail),
    { target: { value: 'anna@example.test' } },
  );
  fireEvent.click(screen.getByRole('button', { name: photoSources.connect }));
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  state.email = null;
  state.native = true;
  api.saveGooglePhotoAccount.mockResolvedValue(undefined);
  api.removeGooglePhotoAccount.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Google account setup', () => {
  it('in the app also asks Google for the access, right after saving the address', async () => {
    confirm.mockResolvedValue('confirmed');
    renderSettings();
    await link();
    expect(
      await screen.findAllByText(photoSources.googleAccountLinked),
    ).not.toHaveLength(0);
    expect(api.saveGooglePhotoAccount).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api.saveGooglePhotoAccount.mock.invocationCallOrder[0]).toBeLessThan(
      confirm.mock.invocationCallOrder[0],
    );
    expect(screen.queryByText(photoSources.googleConsentConfirm)).toBeNull();
  });

  it('keeps the saved address and offers a retry when Google was not confirmed', async () => {
    confirm
      .mockResolvedValueOnce('abandoned')
      .mockResolvedValueOnce('confirmed');
    renderSettings();
    await link();
    expect(
      await screen.findAllByText(photoSources.googleConsentIncomplete),
    ).not.toHaveLength(0);
    expect(screen.getByText('anna@example.test')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: photoSources.googleConsentConfirm }),
    );
    expect(
      await screen.findAllByText(photoSources.googleAccountLinked),
    ).not.toHaveLength(0);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole('button', { name: photoSources.googleConsentConfirm }),
    ).toBeNull();
  });

  it('treats a failing Google step like an unconfirmed one, never as a lost address', async () => {
    confirm.mockRejectedValue(new Error('synthetic'));
    renderSettings();
    await link();
    expect(
      await screen.findAllByText(photoSources.googleConsentIncomplete),
    ).not.toHaveLength(0);
    expect(screen.getByText('anna@example.test')).toBeTruthy();
  });

  it('on the Web only saves the address', async () => {
    state.native = false;
    renderSettings();
    await link();
    expect(
      await screen.findAllByText(photoSources.googleAccountLinked),
    ).not.toHaveLength(0);
    expect(confirm).not.toHaveBeenCalled();
  });
});
