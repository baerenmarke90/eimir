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
import germanUi from '../i18n/locales/de';

const api = {
  startPhotoSelection: vi.fn(),
  pollPhotoSelection: vi.fn(),
  readSelectedPhoto: vi.fn(),
  cancelPhotoSelection: vi.fn(),
};
const browser = {
  prepare: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  returned: vi.fn(() => false),
};

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
    preparePhotoBrowser: () => browser.prepare(),
    openPhotoBrowser: (...args: unknown[]) => browser.open(...args),
    closePhotoBrowser: (...args: unknown[]) => browser.close(...args),
    waitForPhotoPoll: () => Promise.resolve(),
    watchPhotoBrowserReturn: () => () => browser.returned(),
    photoFile: (blob: Blob, index: number) =>
      new File([blob], `photo-${index + 1}.jpg`, { type: 'image/jpeg' }),
  };
});

const AUTHORIZATION =
  'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic';

function ticket() {
  return {
    signal: new AbortController().signal,
    commit: vi.fn((_files: readonly File[]) => true),
    cancel: vi.fn(),
  };
}

function renderPicker(selection = ticket()) {
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
  return selection;
}

async function openGoogle() {
  fireEvent.click(screen.getByRole('button', { name: photoSources.more }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: new RegExp(photoSources.google),
    }),
  );
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
  browser.prepare.mockReturnValue({ closed: false });
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
  browser.returned.mockReturnValue(false);
});

const PICKING = {
  id: 'selection',
  source: 'google',
  status: 'PICKING',
  pollAfterSeconds: 1,
  items: [],
  hasMore: false,
};

describe('Google Photos selection task', () => {
  it('stops waiting when the person is back in the app without a choice', async () => {
    browser.returned.mockReturnValue(true);
    api.pollPhotoSelection.mockResolvedValue(PICKING);
    const selection = renderPicker();
    await openGoogle();
    expect(await screen.findByText(photoSources.nothingChosen)).toBeTruthy();
    // Two more answers from Google were awaited before giving up.
    expect(api.pollPhotoSelection).toHaveBeenCalledTimes(2);
    expect(api.cancelPhotoSelection).toHaveBeenCalledWith({
      spaceId: 'space',
      selectionId: 'selection',
    });
    expect(selection.commit).not.toHaveBeenCalled();
    // The chooser is back, so Google Photos can be opened again.
    expect(
      screen.getByRole('button', { name: new RegExp(photoSources.google) }),
    ).toBeTruthy();
  });

  it('still imports a choice that arrives right after the return', async () => {
    browser.returned.mockReturnValue(true);
    api.pollPhotoSelection
      .mockResolvedValueOnce(PICKING)
      .mockResolvedValue({ ...PICKING, status: 'READY', items: [{ id: 'p' }] });
    api.readSelectedPhoto.mockResolvedValue(
      new Blob(['synthetic'], { type: 'image/jpeg' }),
    );
    const selection = renderPicker();
    await openGoogle();
    await waitFor(() => expect(selection.commit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(photoSources.nothingChosen)).toBeNull();
  });

  it('keeps waiting while Google is still open', async () => {
    let polls = 0;
    api.pollPhotoSelection.mockImplementation(async () => {
      if (++polls > 5) return new Promise(() => {});
      return PICKING;
    });
    renderPicker();
    await openGoogle();
    await waitFor(() => expect(polls).toBeGreaterThan(5));
    expect(screen.getByText(photoSources.waiting)).toBeTruthy();
    expect(api.cancelPhotoSelection).not.toHaveBeenCalled();
  });

  it('offers Google Photos without explanatory copy before authorization starts', async () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: photoSources.more }));
    await screen.findByRole('button', {
      name: new RegExp(photoSources.google),
    });
    expect(
      document.querySelector('.photo-source-sheet .field-help'),
    ).toBeNull();
    expect(api.startPhotoSelection).not.toHaveBeenCalled();
  });

  it('shows one plain instruction while Google is open and no extra step', async () => {
    api.pollPhotoSelection.mockReturnValue(new Promise(() => {}));
    renderPicker();
    await openGoogle();
    expect(await screen.findByText(photoSources.waiting)).toBeTruthy();
    expect(browser.open).toHaveBeenCalledTimes(1);
    expect(browser.open.mock.calls[0][0]).toBe(AUTHORIZATION);
    // Only the sheet's own close action remains; the chooser steps aside.
    expect(
      screen.queryByRole('button', { name: new RegExp(photoSources.google) }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: germanUi.common.retry }),
    ).toBeNull();
  });

  it('keeps the task open after a partial import and retries only the failed photo', async () => {
    api.pollPhotoSelection.mockResolvedValue({
      id: 'selection',
      source: 'google',
      status: 'READY',
      items: [{ id: 'first' }, { id: 'second' }],
      hasMore: false,
    });
    let secondAttempts = 0;
    api.readSelectedPhoto.mockImplementation(
      async ({ itemId }: { itemId: string }) => {
        if (itemId === 'second' && secondAttempts++ < 2)
          throw new Error('transient');
        return new Blob(['synthetic'], { type: 'image/jpeg' });
      },
    );
    const first = ticket();
    const second = ticket();
    let begun = 0;
    render(
      <PhotoSourcePicker
        apiBaseUrl="https://eimir.example"
        accessToken="synthetic-token"
        accountId="account"
        spaceId="space"
        remaining={5}
        beginSelection={() => (begun++ === 0 ? first : second)}
      />,
    );
    await openGoogle();
    const retry = await screen.findByRole('button', {
      name: germanUi.common.retry,
    });
    expect(first.commit).toHaveBeenCalledTimes(1);
    expect(first.commit.mock.calls[0][0]).toHaveLength(1);
    // While photos wait for a retry, the chooser steps aside for the one task.
    expect(
      screen.queryByRole('button', { name: new RegExp(photoSources.google) }),
    ).toBeNull();
    expect(api.cancelPhotoSelection).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(second.commit).toHaveBeenCalledTimes(1));
    expect(second.commit.mock.calls[0][0]).toHaveLength(1);
    // One silent attempt, one failure shown, then the manual retry that succeeds.
    expect(
      api.readSelectedPhoto.mock.calls.filter(([r]) => r.itemId === 'second'),
    ).toHaveLength(3);
    expect(
      api.readSelectedPhoto.mock.calls.filter(([r]) => r.itemId === 'first'),
    ).toHaveLength(1);
  });

  it('offers the retry when every photo failed and nothing was committed', async () => {
    api.pollPhotoSelection.mockResolvedValue({
      id: 'selection',
      source: 'google',
      status: 'READY',
      items: [{ id: 'only' }],
      hasMore: false,
    });
    api.readSelectedPhoto.mockRejectedValueOnce(new Error('transient'));
    api.readSelectedPhoto.mockRejectedValueOnce(new Error('transient'));
    api.readSelectedPhoto.mockResolvedValue(
      new Blob(['synthetic'], { type: 'image/jpeg' }),
    );
    const selection = renderPicker();
    await openGoogle();
    const retry = await screen.findByRole('button', {
      name: germanUi.common.retry,
    });
    expect(selection.commit).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(selection.commit).toHaveBeenCalledTimes(1));
  });
});
