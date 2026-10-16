// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import { GiftIdeaStatus } from '../api/generated/models/GiftIdeaStatus';
import { privateAreaQueryKeys } from '../client/privateArea';
import { ClientProblemError } from '../client/problemDetails';
import privateArea from '../i18n/locales/privateArea';
import { GiftIdeaCreatePage, GiftIdeaEditPage } from './GiftIdeasPage';
import {
  PrivateCollectionCreatePage,
  PrivateCollectionEditPage,
} from './PrivateCollectionsPage';
import { PrivateNoteCreatePage, PrivateNoteEditPage } from './PrivateNotesPage';

const ACCOUNT_ID = 'account-1';
const SPACE_ID = 'space-1';
const RESOURCE_ID = 'resource-1';

const capabilities = { canComment: false, canDelete: true, canEdit: true };
const timestamps = {
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
};
const note = {
  ...timestamps,
  capabilities,
  id: RESOURCE_ID,
  ownerId: ACCOUNT_ID,
  spaceId: SPACE_ID,
  title: 'Existing note',
  body: 'Private draft',
  pinned: false,
  version: 1,
};
const gift = {
  ...timestamps,
  capabilities,
  id: RESOURCE_ID,
  ownerId: ACCOUNT_ID,
  spaceId: SPACE_ID,
  title: 'Existing gift',
  description: null,
  occasion: null,
  pinned: false,
  priceText: null,
  recipient: null,
  status: GiftIdeaStatus.IDEA,
  targetOn: null,
  url: null,
  version: 1,
};
const collection = {
  ...timestamps,
  capabilities,
  id: RESOURCE_ID,
  items: [],
  ownerId: ACCOUNT_ID,
  spaceId: SPACE_ID,
  title: 'Existing collection',
  version: 1,
};

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

function renderCreate(element: ReactElement) {
  render(
    <QueryClientProvider client={queryClient()}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function createPage(
  kind: 'note' | 'gift' | 'collection',
  api: PrivateAreaApi,
): ReactElement {
  if (kind === 'note') {
    return (
      <PrivateNoteCreatePage
        api={api}
        accountId={ACCOUNT_ID}
        spaceId={SPACE_ID}
      />
    );
  }
  if (kind === 'gift') {
    return (
      <GiftIdeaCreatePage api={api} accountId={ACCOUNT_ID} spaceId={SPACE_ID} />
    );
  }
  return (
    <PrivateCollectionCreatePage
      api={api}
      accountId={ACCOUNT_ID}
      spaceId={SPACE_ID}
    />
  );
}

function assertWhitespaceError(
  inputId: string,
  mutation: ReturnType<typeof vi.fn>,
) {
  const input = document.getElementById(inputId) as HTMLInputElement;
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);

  expect(mutation).not.toHaveBeenCalled();
  expect(input.value).toBe('   ');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toMatch(/-error$/);
  expect(document.activeElement).toBe(input);
  expect(screen.getByText(privateArea.titleRequired)).toBeDefined();
  return input;
}

describe('private create title validation', () => {
  it('keeps and corrects a whitespace-only private note title', async () => {
    const create = vi.fn().mockResolvedValue({ ...note, title: 'Valid note' });
    renderCreate(
      <PrivateNoteCreatePage
        api={{ createPrivateNote: create } as unknown as PrivateAreaApi}
        accountId={ACCOUNT_ID}
        spaceId={SPACE_ID}
      />,
    );
    const input = assertWhitespaceError('private-note-title', create);
    fireEvent.change(input, { target: { value: '  Valid note  ' } });
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        spaceId: SPACE_ID,
        privateNoteCreate: {
          title: 'Valid note',
          body: '',
          pinned: false,
        },
      }),
    );
  });

  it('keeps and corrects a whitespace-only gift title', async () => {
    const create = vi.fn().mockResolvedValue({ ...gift, title: 'Valid gift' });
    renderCreate(
      <GiftIdeaCreatePage
        api={{ createGiftIdea: create } as unknown as PrivateAreaApi}
        accountId={ACCOUNT_ID}
        spaceId={SPACE_ID}
      />,
    );
    const input = assertWhitespaceError('gift-title', create);
    fireEvent.change(input, { target: { value: ' Valid gift ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0].giftIdeaCreate.title).toBe('Valid gift');
  });

  it('keeps and corrects a whitespace-only collection title', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ ...collection, title: 'Valid collection' });
    renderCreate(
      <PrivateCollectionCreatePage
        api={{ createPrivateCollection: create } as unknown as PrivateAreaApi}
        accountId={ACCOUNT_ID}
        spaceId={SPACE_ID}
      />,
    );
    const input = assertWhitespaceError('private-collection-title', create);
    fireEvent.change(input, { target: { value: ' Valid collection ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        spaceId: SPACE_ID,
        privateCollectionCreate: { title: 'Valid collection' },
      }),
    );
  });

  it.each([
    [
      'note',
      'private-note-title',
      'createPrivateNote',
      'PRIVATE_NOTE_TITLE_REQUIRED',
    ],
    ['gift', 'gift-title', 'createGiftIdea', 'GIFT_IDEA_TITLE_REQUIRED'],
    [
      'collection',
      'private-collection-title',
      'createPrivateCollection',
      'PRIVATE_COLLECTION_TITLE_REQUIRED',
    ],
  ] as const)(
    'maps the known %s server title error back to its field',
    async (kind, inputId, apiMethod, errorCode) => {
      const create = vi
        .fn()
        .mockRejectedValue(
          new ClientProblemError('validation', 422, errorCode),
        );
      const api = { [apiMethod]: create } as unknown as PrivateAreaApi;
      renderCreate(createPage(kind, api));
      const input = document.getElementById(inputId) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Draft title' } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);

      await waitFor(() => {
        expect(input.value).toBe('Draft title');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(input);
        expect(screen.getByText(privateArea.titleRequired)).toBeDefined();
      });
      expect(document.querySelector('.ui-state')).toBeNull();
    },
  );

  it('keeps an unknown server failure in the generic problem state', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new ClientProblemError('server', 503));
    renderCreate(
      createPage('note', {
        createPrivateNote: create,
      } as unknown as PrivateAreaApi),
    );
    const input = document.getElementById(
      'private-note-title',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Preserved draft' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(document.querySelector('.ui-state')).not.toBeNull(),
    );
    expect(input.value).toBe('Preserved draft');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});

type EditFixture = {
  name: string;
  path: string;
  route: string;
  inputId: string;
  queryKey: readonly unknown[];
  detail: unknown;
  apiMethod: string;
  element: (api: PrivateAreaApi) => ReactElement;
};

const editFixtures: EditFixture[] = [
  {
    name: 'private note',
    path: `/notes/${RESOURCE_ID}/edit`,
    route: '/notes/:noteId/edit',
    inputId: 'private-note-title',
    queryKey: privateAreaQueryKeys.note(ACCOUNT_ID, SPACE_ID, RESOURCE_ID),
    detail: note,
    apiMethod: 'updatePrivateNote',
    element: (api) => (
      <PrivateNoteEditPage
        api={api}
        accountId={ACCOUNT_ID}
        spaceId={SPACE_ID}
      />
    ),
  },
  {
    name: 'gift idea',
    path: `/gifts/${RESOURCE_ID}/edit`,
    route: '/gifts/:giftIdeaId/edit',
    inputId: 'gift-title',
    queryKey: privateAreaQueryKeys.giftIdea(ACCOUNT_ID, SPACE_ID, RESOURCE_ID),
    detail: gift,
    apiMethod: 'updateGiftIdea',
    element: (api) => (
      <GiftIdeaEditPage api={api} accountId={ACCOUNT_ID} spaceId={SPACE_ID} />
    ),
  },
  {
    name: 'private collection',
    path: `/collections/${RESOURCE_ID}/edit`,
    route: '/collections/:collectionId/edit',
    inputId: 'private-collection-title',
    queryKey: privateAreaQueryKeys.collection(
      ACCOUNT_ID,
      SPACE_ID,
      RESOURCE_ID,
    ),
    detail: collection,
    apiMethod: 'updatePrivateCollection',
    element: (api) => (
      <PrivateCollectionEditPage
        api={api}
        accountId={ACCOUNT_ID}
        spaceId={SPACE_ID}
      />
    ),
  },
];

describe('private edit title validation', () => {
  it.each(editFixtures)(
    'keeps and corrects a whitespace-only $name title',
    async (fixture) => {
      const client = queryClient();
      client.setQueryData(fixture.queryKey, fixture.detail);
      const update = vi.fn().mockResolvedValue({
        ...(fixture.detail as object),
        title: 'Corrected title',
        version: 2,
      });
      const api = { [fixture.apiMethod]: update } as unknown as PrivateAreaApi;
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[fixture.path]}>
            <Routes>
              <Route path={fixture.route} element={fixture.element(api)} />
              <Route path="*" element={null} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const input = assertWhitespaceError(fixture.inputId, update);
      fireEvent.change(input, { target: { value: ' Corrected title ' } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      const request = update.mock.calls[0]?.[0] as Record<string, unknown>;
      const updateBody = Object.values(request).find(
        (value) => value && typeof value === 'object' && 'title' in value,
      ) as { title: string };
      expect(updateBody.title).toBe('Corrected title');
    },
  );
});
