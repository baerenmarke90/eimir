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
import { PhotoSourcePicker } from './PhotoSourcePicker';

const api = {
  startPhotoSelection: vi.fn(),
  authorizePhotoSelection: vi.fn(),
  pollPhotoSelection: vi.fn(),
  readSelectedPhoto: vi.fn(),
  cancelPhotoSelection: vi.fn(),
};
const browser = { open: vi.fn(), close: vi.fn(), appReturn: vi.fn() };

vi.mock('../pwa', () => ({ isCapacitorNative: () => true }));
vi.mock('../client/usePhotoSources', () => ({
  usePhotoSources: () => ({
    apiRef: { current: api },
    availability: {
      enabled: true,
      canImport: true,
      googleAvailable: true,
      immichConnected: false,
    },
    loading: false,
  }),
}));
vi.mock('../client/photoSources', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../client/photoSources')>();
  return {
    ...original,
    openPhotoBrowser: (...args: unknown[]) => browser.open(...args),
    closePhotoBrowser: (...args: unknown[]) => browser.close(...args),
    waitForPhotoPoll: () => Promise.resolve(),
    watchGoogleAppReturn: () => browser.appReturn(),
    watchPhotoBrowserReturn: () => () => false,
    photoFile: (blob: Blob, index: number) =>
      new File([blob], `photo-${index + 1}.jpg`, { type: 'image/jpeg' }),
  };
});

const AUTHORIZATION = 'https://accounts.google.com/o/oauth2/v2/auth?state=s';
const PICKER = 'https://photos.google.com/picker/session';

function ticket() {
  return {
    signal: new AbortController().signal,
    commit: vi.fn((_files: readonly File[]) => true),
    cancel: vi.fn(),
  };
}

async function openGoogle(selection = ticket()) {
  render(
    <PhotoSourcePicker
      apiBaseUrl="https://eimir.example"
      accessToken="synthetic-token"
      accountId="account"
      spaceId="space"
      remaining={5}
      beginSelection={() => selection}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: photoSources.more }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: new RegExp(photoSources.google),
    }),
  );
  return selection;
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
  browser.open.mockResolvedValue(undefined);
  browser.close.mockResolvedValue(undefined);
  api.cancelPhotoSelection.mockResolvedValue(undefined);
  api.startPhotoSelection.mockResolvedValue({
    id: 'selection',
    source: 'google',
    status: 'AUTHORIZING',
    authorizationUrl: AUTHORIZATION,
    pollAfterSeconds: 1,
    items: [],
    hasMore: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Google Photos in the installed app', () => {
  it('signs in at Google, finishes through the app link, then opens the picker', async () => {
    browser.appReturn.mockResolvedValue({ state: 'state-1', code: 'code-1' });
    api.authorizePhotoSelection.mockResolvedValue({
      id: 'selection',
      source: 'google',
      status: 'PICKING',
      pickerUri: PICKER,
      pollAfterSeconds: 1,
      items: [],
      hasMore: false,
    });
    api.pollPhotoSelection.mockResolvedValue({
      id: 'selection',
      source: 'google',
      status: 'READY',
      pollAfterSeconds: 1,
      items: [{ id: 'p' }],
      hasMore: false,
    });
    api.readSelectedPhoto.mockResolvedValue(
      new Blob(['synthetic'], { type: 'image/jpeg' }),
    );
    const selection = await openGoogle();
    await waitFor(() => expect(selection.commit).toHaveBeenCalledTimes(1));
    expect(
      api.startPhotoSelection.mock.calls[0][0].photoSelectionCreate,
    ).toMatchObject({ source: 'google', returnTo: 'app' });
    expect(api.authorizePhotoSelection).toHaveBeenCalledWith(
      {
        spaceId: 'space',
        selectionId: 'selection',
        photoSelectionAuthorize: { state: 'state-1', code: 'code-1' },
      },
      expect.anything(),
    );
    // First Google's sign-in, then the Photos picker; never the picker before the exchange.
    expect(browser.open.mock.calls.map((call) => call[0])).toEqual([
      AUTHORIZATION,
      PICKER,
    ]);
    expect(
      api.authorizePhotoSelection.mock.invocationCallOrder[0],
    ).toBeLessThan(browser.open.mock.invocationCallOrder[1]);
  });

  it('stops and cancels when the person leaves Google without signing in', async () => {
    browser.appReturn.mockResolvedValue('abandoned');
    const selection = await openGoogle();
    expect(await screen.findByText(photoSources.nothingChosen)).toBeTruthy();
    expect(api.authorizePhotoSelection).not.toHaveBeenCalled();
    expect(api.cancelPhotoSelection).toHaveBeenCalledWith({
      spaceId: 'space',
      selectionId: 'selection',
    });
    expect(selection.commit).not.toHaveBeenCalled();
    expect(browser.open).toHaveBeenCalledTimes(1);
  });

  it('treats a denied consent like no choice', async () => {
    browser.appReturn.mockResolvedValue('denied');
    await openGoogle();
    expect(await screen.findByText(photoSources.nothingChosen)).toBeTruthy();
    expect(api.authorizePhotoSelection).not.toHaveBeenCalled();
  });

  it('shows the unavailable message when the server refuses the sign-in', async () => {
    browser.appReturn.mockResolvedValue({ state: 's', code: 'c' });
    api.authorizePhotoSelection.mockResolvedValue({
      id: 'selection',
      source: 'google',
      status: 'FAILED',
      pollAfterSeconds: 5,
      items: [],
      hasMore: false,
    });
    await openGoogle();
    expect(await screen.findByText(photoSources.unavailable)).toBeTruthy();
    expect(browser.open).toHaveBeenCalledTimes(1);
  });
});
