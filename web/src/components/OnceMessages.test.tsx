// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  OnceMessagesContext,
  type OnceEnvironment,
} from '../client/onceMessages';
import { ClientProblemError } from '../client/problemDetails';
import { i18n } from '../i18n';
import { OnceMessagesPage } from './OnceMessages';

const cryptoMocks = vi.hoisted(() => ({
  key: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../client/onceMessageCrypto', () => ({
  ONCE_TEXT_MAX_LENGTH: 4000,
  deviceKey: cryptoMocks.key,
  encryptOnce: cryptoMocks.encrypt,
  decryptOnce: cryptoMocks.decrypt,
  removeDeviceKey: cryptoMocks.remove,
  base64Bytes: vi.fn(),
  onceMediaBlob: vi.fn(),
  prepareOnceAudio: vi.fn(),
  prepareOncePhoto: vi.fn(),
}));

const key = { id: 'device', publicJwk: {}, privateKey: {} };
const ready = {
  receptionVersion: 1,
  ownEnabled: true,
  partnerEnabled: true,
  canSend: true,
  partner: { id: 'partner', displayName: 'Alex' },
  ownDeviceIds: ['device'],
  recipientDevices: [{ id: 'partner-device', publicJwk: {} }],
};

function setup(
  mode: 'compose' | 'read' | 'inbox' = 'compose',
  overrides: Record<string, unknown> = {},
) {
  const api = {
    getOnceMessageStatus: vi.fn().mockResolvedValue(ready),
    setOnceMessageReception: vi.fn().mockResolvedValue(ready),
    listOnceMessages: vi.fn().mockResolvedValue({ items: [] }),
    getSealedOnceMessage: vi.fn().mockResolvedValue({
      id: 'message',
      requestId: 'request',
      sender: { id: 'partner', displayName: 'Alex' },
      expiresAt: new Date(Date.now() + 86400_000),
    }),
    sendOnceMessage: vi.fn().mockResolvedValue({
      id: 'sent',
      expiresAt: new Date(Date.now() + 86400_000),
    }),
    openOnceMessage: vi.fn().mockResolvedValue({
      envelope: {},
      viewUntil: new Date(Date.now() + 300_000),
    }),
    acknowledgeOnceMessage: vi.fn().mockResolvedValue(undefined),
    discardOnceMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const path =
    mode === 'read'
      ? '/today/only-you/message'
      : mode === 'inbox'
        ? '/today/only-you'
        : '/today/only-you/new';
  const page = (accountId: string) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <OnceMessagesContext.Provider
          value={
            {
              api,
              accountId,
              spaceId: 'space',
              scope: `instance:${accountId}:space`,
            } as unknown as OnceEnvironment
          }
        >
          <Routes>
            <Route
              path={mode === 'read' ? '/today/only-you/:messageId' : path}
              element={<OnceMessagesPage mode={mode} />}
            />
            <Route path="/today" element={<h1>Us home</h1>} />
          </Routes>
        </OnceMessagesContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(page('account-a'));
  return { api, client, view, page };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  window.history.replaceState(null, '', '/');
  onlineManager.setOnline(true);
  vi.clearAllMocks();
  cryptoMocks.key.mockResolvedValue(key);
  cryptoMocks.encrypt.mockResolvedValue({ ciphertext: 'opaque' });
  cryptoMocks.decrypt.mockResolvedValue({ text: 'A private thought', v: 1 });
  cryptoMocks.remove.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

describe('one-time partner interaction', () => {
  it('keeps reception available without Pro while new sending remains gated', async () => {
    let enabled = false;
    cryptoMocks.key.mockImplementation(async (_scope, create) =>
      create ? key : undefined,
    );
    const status = () => ({
      ...ready,
      canSend: false,
      ownEnabled: enabled,
      ownDeviceIds: enabled ? [key.id] : [],
    });
    const setReception = vi.fn().mockImplementation(async () => {
      enabled = true;
      return status();
    });
    const { api } = setup('compose', {
      getOnceMessageStatus: vi.fn().mockImplementation(async () => status()),
      setOnceMessageReception: setReception,
    });
    await screen.findByRole('button', { name: i18n.t('onceMessages.enable') });
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('onceMessages.enable') }),
    );
    await waitFor(() => expect(setReception).toHaveBeenCalledTimes(1));
    expect(api.sendOnceMessage).not.toHaveBeenCalled();
    expect(await screen.findByText(i18n.t('onceMessages.pro'))).toBeDefined();
  });

  it('does not claim on reading metadata and acknowledges a late response after the reader was left', async () => {
    let resolve!: (value: unknown) => void;
    const open = vi.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { api, view } = setup('read', { openOnceMessage: open });
    const button = await screen.findByRole('button', {
      name: i18n.t('onceMessages.open'),
    });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => {
      resolve({ envelope: {}, viewUntil: new Date(Date.now() + 300_000) });
    });
    expect(api.acknowledgeOnceMessage).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('A private thought')).toBeNull();
  });

  it('does not apply an old send result to a different account or erase its new draft', async () => {
    let resolve!: (value: unknown) => void;
    const send = vi.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { view, page } = setup('compose', { sendOnceMessage: send });
    const input = await screen.findByRole('textbox', {
      name: i18n.t('onceMessages.message'),
    });
    fireEvent.change(input, { target: { value: 'First account draft' } });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('onceMessages.send') }),
    );
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    view.rerender(page('account-b'));
    const next = await screen.findByRole('textbox', {
      name: i18n.t('onceMessages.message'),
    });
    fireEvent.change(next, { target: { value: 'Second account draft' } });
    await act(async () => {
      resolve({ id: 'sent', expiresAt: new Date() });
    });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Second account draft',
    );
    expect(
      screen.queryByRole('heading', { name: i18n.t('onceMessages.sent') }),
    ).toBeNull();
  });

  it('retains a draft on a rejected write and guards deliberate Back', async () => {
    const { api } = setup('compose', {
      sendOnceMessage: vi
        .fn()
        .mockRejectedValue(
          new ClientProblemError('conflict', 409, 'ONCE_RECEPTION_REQUIRED'),
        ),
    });
    const input = await screen.findByRole('textbox', {
      name: i18n.t('onceMessages.message'),
    });
    fireEvent.change(input, { target: { value: 'Keep this thought' } });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('onceMessages.send') }),
    );
    await waitFor(() => expect(api.sendOnceMessage).toHaveBeenCalledTimes(1));
    await screen.findByText(
      i18n.t('onceMessages.errors.ONCE_RECEPTION_REQUIRED'),
    );
    expect((input as HTMLTextAreaElement).value).toBe('Keep this thought');
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('taskBoundary.back') }),
    );
    expect(await screen.findByRole('dialog')).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('taskBoundary.keepEditing') }),
    );
    expect((input as HTMLTextAreaElement).value).toBe('Keep this thought');
  });
  it('lets the sender withdraw from the confirmed result without opening content', async () => {
    const { api } = setup();
    const input = await screen.findByRole('textbox', {
      name: i18n.t('onceMessages.message'),
    });
    fireEvent.change(input, { target: { value: 'A fleeting thought' } });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('onceMessages.send') }),
    );
    await screen.findByRole('heading', { name: i18n.t('onceMessages.sent') });
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('onceMessages.withdraw') }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog.querySelector('button.primary')!);
    await screen.findByRole('heading', {
      name: i18n.t('onceMessages.withdrawn'),
    });
    expect(api.discardOnceMessage).toHaveBeenCalledWith(
      { spaceId: 'space', messageId: 'sent' },
      { cache: 'no-store' },
    );
    expect(api.openOnceMessage).not.toHaveBeenCalled();
  });
});
