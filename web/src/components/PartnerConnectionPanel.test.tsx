// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitationsApi } from '../api/generated/apis/InvitationsApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { IssuedInvitationView } from '../api/generated/models/IssuedInvitationView';
import partnerConnection from '../i18n/locales/partnerConnection';
import { PartnerConnectionPanel } from './PartnerConnectionPanel';

const SPACE_A = 'space-a';
const SPACE_B = 'space-b';
const TOKEN_A = 'one-time-secret-space-a';
const TOKEN_B = 'one-time-secret-space-b';
const ACCOUNT_A: AccountView = { id: 'account-a', displayName: 'Alex' };
const ACCOUNT_B: AccountView = { id: 'account-b', displayName: 'Sam' };
const originalClipboard = navigator.clipboard;
const originalIndexedDb = globalThis.indexedDB;

type PanelProps = {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
};

const DEFAULT_PROPS: PanelProps = {
  apiBaseUrl: 'http://api.example.test',
  accessToken: 'session-a',
  account: ACCOUNT_A,
  spaceId: SPACE_A,
};

function issuedInvitation(id: string, token: string): IssuedInvitationView {
  return {
    createdAt: new Date('2026-09-06T00:00:00Z'),
    expiresAt: new Date('2026-09-07T00:00:00Z'),
    id,
    token,
  };
}

function mockReadApis() {
  const spaceSpy = vi
    .spyOn(SpacesApi.prototype, 'getSpaceApiV1SpacesSpaceIdGet')
    .mockImplementation(async ({ spaceId }) => ({
      createdAt: new Date('2026-09-01T00:00:00Z'),
      id: spaceId,
      // Both contexts deliberately have no partner so the panel remains
      // rendered while the active Space changes.
      partners: [],
    }));
  const listSpy = vi
    .spyOn(
      InvitationsApi.prototype,
      'listInvitationsApiV1SpacesSpaceIdInvitationsGet',
    )
    .mockResolvedValue([]);
  return { listSpy, spaceSpy };
}

function renderPanel(initialProps: PanelProps = DEFAULT_PROPS) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const tree = (props: PanelProps) => (
    <QueryClientProvider client={queryClient}>
      <PartnerConnectionPanel {...props} />
    </QueryClientProvider>
  );

  const view = render(tree(initialProps));
  return {
    ...view,
    queryClient,
    rerenderPanel: (props: PanelProps) => view.rerender(tree(props)),
    rerenderLoggedOut: () =>
      view.rerender(<QueryClientProvider client={queryClient} />),
  };
}

async function issueCurrentInvitation() {
  const createButton = await screen.findByRole('button', {
    name: partnerConnection.create,
  });
  fireEvent.click(createButton);
  return screen.findByLabelText(partnerConnection.linkLabel);
}

function storageContents(storage?: Storage | null): string {
  if (!storage) return '';
  const entries: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) entries.push(`${key}=${storage.getItem(key) ?? ''}`);
  }
  return entries.join('\n');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage?.clear?.();
  window.sessionStorage?.clear?.();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: originalIndexedDb,
  });
});

describe('PartnerConnectionPanel one-time invitation privacy', () => {
  it('drops the issued token immediately on Space change and never restores it when switching back', async () => {
    const { listSpy } = mockReadApis();
    vi.spyOn(
      InvitationsApi.prototype,
      'createInvitationApiV1SpacesSpaceIdInvitationsPost',
    ).mockResolvedValue(issuedInvitation('invitation-a', TOKEN_A));
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });

    const { queryClient, rerenderPanel } = renderPanel();
    const issuedLink = (await issueCurrentInvitation()) as HTMLInputElement;
    expect(issuedLink.value).toContain(TOKEN_A);
    expect(
      screen.getByRole('button', { name: partnerConnection.copy }),
    ).toBeDefined();

    rerenderPanel({ ...DEFAULT_PROPS, spaceId: SPACE_B });

    expect(screen.queryByLabelText(partnerConnection.linkLabel)).toBeNull();
    expect(
      screen.queryByRole('button', { name: partnerConnection.copy }),
    ).toBeNull();
    expect(clipboardWrite).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith({ spaceId: SPACE_B });
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: ['space-invitations', SPACE_A],
      }),
    ).toBeDefined();
    expect(
      queryClient.getQueryCache().find({
        queryKey: ['space-invitations', SPACE_B],
      }),
    ).toBeDefined();

    rerenderPanel(DEFAULT_PROPS);
    await screen.findByRole('button', { name: partnerConnection.create });
    expect(screen.queryByLabelText(partnerConnection.linkLabel)).toBeNull();
    expect(clipboardWrite).not.toHaveBeenCalled();
  });

  it('drops one-time state on Account change and logout/re-login even for the same Space', async () => {
    mockReadApis();
    vi.spyOn(
      InvitationsApi.prototype,
      'createInvitationApiV1SpacesSpaceIdInvitationsPost',
    )
      .mockResolvedValueOnce(issuedInvitation('invitation-a', TOKEN_A))
      .mockResolvedValueOnce(issuedInvitation('invitation-b', TOKEN_B));

    const { rerenderLoggedOut, rerenderPanel } = renderPanel();
    let issuedLink = (await issueCurrentInvitation()) as HTMLInputElement;
    expect(issuedLink.value).toContain(TOKEN_A);

    const accountBProps = { ...DEFAULT_PROPS, account: ACCOUNT_B };
    rerenderPanel(accountBProps);
    await screen.findByRole('button', { name: partnerConnection.create });
    expect(screen.queryByLabelText(partnerConnection.linkLabel)).toBeNull();

    issuedLink = (await issueCurrentInvitation()) as HTMLInputElement;
    expect(issuedLink.value).toContain(TOKEN_B);

    rerenderLoggedOut();
    expect(screen.queryByLabelText(partnerConnection.linkLabel)).toBeNull();

    rerenderPanel({ ...accountBProps, accessToken: 'session-b' });
    await screen.findByRole('button', { name: partnerConnection.create });
    expect(screen.queryByLabelText(partnerConnection.linkLabel)).toBeNull();
  });

  it('keeps the plaintext token out of Query data and persistent browser storage', async () => {
    mockReadApis();
    vi.spyOn(
      InvitationsApi.prototype,
      'createInvitationApiV1SpacesSpaceIdInvitationsPost',
    ).mockResolvedValue(issuedInvitation('invitation-a', TOKEN_A));
    const indexedDbOpen = vi.fn();
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open: indexedDbOpen },
    });

    const { queryClient } = renderPanel();
    const issuedLink = (await issueCurrentInvitation()) as HTMLInputElement;
    expect(issuedLink.value).toContain(TOKEN_A);

    const queryData = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data ?? null),
    );
    expect(queryData).not.toContain(TOKEN_A);
    expect(storageContents(window.localStorage)).not.toContain(TOKEN_A);
    expect(storageContents(window.sessionStorage)).not.toContain(TOKEN_A);
    expect(indexedDbOpen).not.toHaveBeenCalled();
  });

  it('does not surface an in-flight token after leaving and returning to its original Space', async () => {
    mockReadApis();
    let resolveCreate: ((value: IssuedInvitationView) => void) | undefined;
    vi.spyOn(
      InvitationsApi.prototype,
      'createInvitationApiV1SpacesSpaceIdInvitationsPost',
    ).mockImplementation(
      () =>
        new Promise<IssuedInvitationView>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const { rerenderPanel } = renderPanel();
    const createButton = await screen.findByRole('button', {
      name: partnerConnection.create,
    });
    fireEvent.click(createButton);
    await waitFor(() => expect(resolveCreate).toBeDefined());

    rerenderPanel({ ...DEFAULT_PROPS, spaceId: SPACE_B });
    rerenderPanel(DEFAULT_PROPS);
    resolveCreate?.(issuedInvitation('invitation-a', TOKEN_A));

    await waitFor(() => {
      expect(screen.queryByLabelText(partnerConnection.linkLabel)).toBeNull();
    });
  });
});
