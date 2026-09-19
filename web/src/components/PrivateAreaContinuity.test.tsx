// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import {
  PRIVATE_NOTES_PATH,
  privateAreaQueryKeys,
  privateNotePath,
} from '../client/privateArea';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import privateArea from '../i18n/locales/privateArea';
import taskBoundary from '../i18n/locales/taskBoundary';
import { PrivateNoteCreatePage, PrivateNoteDetailPage, PrivateNoteEditPage } from './PrivateNotesPage';

const ACCOUNT_ID = 'account-1';
const SPACE_ID = 'space-1';
const NOTE_ID = 'note-1';

const note = {
  id: NOTE_ID,
  ownerId: ACCOUNT_ID,
  spaceId: SPACE_ID,
  title: 'Hidden cabin idea',
  body: 'Only for me',
  pinned: false,
  version: 1,
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-09-19T10:00:00Z'),
  updatedAt: new Date('2026-09-19T10:00:00Z'),
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  window.history.replaceState({}, '', '/search');
});

afterEach(() => cleanup());

function client() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(
    privateAreaQueryKeys.note(ACCOUNT_ID, SPACE_ID, NOTE_ID),
    note,
  );
  return queryClient;
}

function SearchOrigin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { captureOrigin, resolveOrigin, registerOriginMetadata } =
    useTaskOrigin();
  const returnKey = (
    location.state as { taskReturnKey?: unknown } | null
  )?.taskReturnKey;
  const restored = resolveOrigin(returnKey);

  useEffect(
    () =>
      registerOriginMetadata({
        searchQuery: 'cabin',
        searchKind: 'PRIVATE_NOTE',
      }),
    [registerOriginMetadata],
  );

  return (
    <>
      <p data-testid="restored-search">
        {restored?.searchQuery ?? 'fresh'}:{restored?.searchKind ?? 'all'}
      </p>
      <button
        type="button"
        onClick={() => {
          const taskOriginKey = captureOrigin();
          navigate(privateNotePath(NOTE_ID), {
            state: taskOriginKey ? { taskOriginKey } : undefined,
          });
        }}
      >
        Open private result
      </button>
    </>
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client()}>
      <BrowserRouter>
        <TaskOriginProvider accountId={ACCOUNT_ID} spaceId={SPACE_ID}>
          {children}
        </TaskOriginProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('P1 private task continuity', () => {
  it('preserves Search origin through private detail -> edit -> cancel -> detail -> return', async () => {
    const api = {} as PrivateAreaApi;
    render(
      <Providers>
        <Routes>
          <Route path="/search" element={<SearchOrigin />} />
          <Route
            path="/more/private/notes/:noteId"
            element={
              <PrivateNoteDetailPage
                api={api}
                accountId={ACCOUNT_ID}
                spaceId={SPACE_ID}
              />
            }
          />
          <Route
            path="/more/private/notes/:noteId/edit"
            element={
              <PrivateNoteEditPage
                api={api}
                accountId={ACCOUNT_ID}
                spaceId={SPACE_ID}
              />
            }
          />
        </Routes>
      </Providers>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open private result' }));
    expect(
      await screen.findByRole('heading', { name: note.title }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('link', { name: privateArea.edit }));
    expect(
      await screen.findByRole('heading', { name: privateArea.notes.editTitle }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /abbrechen/i }));
    expect(
      await screen.findByRole('heading', { name: note.title }),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole('button', { name: privateArea.backToSearch }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('restored-search').textContent).toBe(
        'cabin:PRIVATE_NOTE',
      ),
    );
  });

  it('guards a dirty private create task and only leaves after explicit discard', async () => {
    window.history.replaceState({}, '', `${PRIVATE_NOTES_PATH}/new`);
    render(
      <Providers>
        <Routes>
          <Route
            path="/more/private/notes/new"
            element={
              <PrivateNoteCreatePage
                api={{} as PrivateAreaApi}
                accountId={ACCOUNT_ID}
                spaceId={SPACE_ID}
              />
            }
          />
          <Route
            path="/more/private/notes"
            element={<p>Private notes list</p>}
          />
        </Routes>
      </Providers>,
    );

    const title = screen.getByLabelText(privateArea.notes.titleLabel);
    fireEvent.change(title, { target: { value: 'Keep this draft' } });
    fireEvent.click(
      screen.getByRole('button', { name: privateArea.notes.detailBack }),
    );

    expect(
      await screen.findByRole('alertdialog', {
        name: taskBoundary.discardTitle,
      }),
    ).toBeDefined();
    expect((title as HTMLInputElement).value).toBe('Keep this draft');

    fireEvent.click(
      screen.getByRole('button', { name: taskBoundary.keepEditing }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).toBeNull(),
    );

    fireEvent.click(
      screen.getByRole('button', { name: privateArea.notes.detailBack }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: taskBoundary.discard }),
    );

    expect(await screen.findByText('Private notes list')).toBeDefined();
  });
});
