// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import { privateAreaQueryKeys } from '../client/privateArea';
import privateArea from '../i18n/locales/privateArea';
import { GiftIdeaCreatePage } from './GiftIdeasPage';
import { PrivateCollectionCreatePage } from './PrivateCollectionsPage';
import { PrivateNoteCreatePage } from './PrivateNotesPage';

const accountId = 'account-1';
const spaceId = 'space-1';
const saved = { id: 'created-1', title: 'Personal plan' };
const definitions = [
  {
    name: 'private note',
    Editor: PrivateNoteCreatePage,
    path: '/more/private/notes',
    key: privateAreaQueryKeys.notes(accountId, spaceId),
    label: privateArea.notes.titleLabel,
  },
  {
    name: 'gift idea',
    Editor: GiftIdeaCreatePage,
    path: '/more/private/gift-ideas',
    key: privateAreaQueryKeys.giftIdeas(accountId, spaceId),
    label: privateArea.gifts.titleLabel,
  },
  {
    name: 'private collection',
    Editor: PrivateCollectionCreatePage,
    path: '/more/private/collections',
    key: privateAreaQueryKeys.collections(accountId, spaceId),
    label: privateArea.collections.titleLabel,
  },
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((success) => {
    resolve = success;
  });
  return { promise, resolve };
}

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

beforeEach(() => window.history.replaceState({}, '', '/'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

for (const definition of definitions) {
  describe(`${definition.name} create settlement ownership`, () => {
    function setup() {
      const write = deferred<typeof saved>();
      const create = vi.fn(() => write.promise);
      const api = {
        createPrivateNote: create,
        createGiftIdea: create,
        createPrivateCollection: create,
      } as unknown as PrivateAreaApi;
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      queryClient.setQueryData(definition.key, { items: [] });
      let endSession!: () => void;
      const Editor = definition.Editor;
      function Harness() {
        const [active, setActive] = useState(true);
        endSession = () => setActive(false);
        return (
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[`${definition.path}/new`]}>
              <Location />
              <Routes>
                <Route
                  path={`${definition.path}/new`}
                  element={
                    active ? (
                      <Editor
                        api={api}
                        accountId={accountId}
                        spaceId={spaceId}
                      />
                    ) : (
                      <p>Session ended</p>
                    )
                  }
                />
                <Route
                  path={`${definition.path}/${saved.id}`}
                  element={<p>Authorized created result</p>}
                />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        );
      }
      render(<Harness />);
      async function submit() {
        fireEvent.change(screen.getByLabelText(definition.label), {
          target: { value: saved.title },
        });
        fireEvent.click(screen.getByRole('button', { name: privateArea.save }));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      }
      return { write, create, queryClient, endSession, submit };
    }

    it.each(['removed', 'replaced'])(
      'does not redirect or invalidate a %s session after its task unmounts',
      async (state) => {
        const h = setup();
        await h.submit();
        act(() => h.endSession());
        h.queryClient.clear();
        const replacement = { items: [{ id: 'fresh-session' }] };
        if (state === 'replaced')
          h.queryClient.setQueryData(definition.key, replacement);
        const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
        await act(async () => {
          h.write.resolve(saved);
        });
        expect(invalidate).not.toHaveBeenCalled();
        expect(h.queryClient.getQueryData(definition.key)).toEqual(
          state === 'replaced' ? replacement : undefined,
        );
        expect(screen.getByTestId('location').textContent).toBe(
          `${definition.path}/new`,
        );
        expect(screen.getByText('Session ended')).toBeDefined();
      },
    );

    it('does not redirect after the task ends during awaited list recovery', async () => {
      const h = setup();
      await h.submit();
      const recovery = deferred<void>();
      const invalidate = vi
        .spyOn(h.queryClient, 'invalidateQueries')
        .mockReturnValue(recovery.promise);
      await act(async () => {
        h.write.resolve(saved);
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: definition.key });
      act(() => h.endSession());
      h.queryClient.clear();
      await act(async () => {
        recovery.resolve();
      });
      expect(screen.getByTestId('location').textContent).toBe(
        `${definition.path}/new`,
      );
      expect(screen.getByText('Session ended')).toBeDefined();
    });

    it('does not redirect after the task ends during deferred history removal', async () => {
      const h = setup();
      await h.submit();
      const back = vi
        .spyOn(window.history, 'back')
        .mockImplementation(() => {});
      await act(async () => {
        h.write.resolve(saved);
      });
      expect(back).toHaveBeenCalledTimes(1);
      act(() => h.endSession());
      h.queryClient.clear();
      await act(async () => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(screen.getByTestId('location').textContent).toBe(
        `${definition.path}/new`,
      );
      expect(screen.getByText('Session ended')).toBeDefined();
    });

    it('refreshes the original list after leaving the task without redirecting', async () => {
      const h = setup();
      await h.submit();
      act(() => h.endSession());
      const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
      await act(async () => {
        h.write.resolve(saved);
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: definition.key });
      expect(h.queryClient.getQueryState(definition.key)?.isInvalidated).toBe(
        true,
      );
      expect(screen.getByTestId('location').textContent).toBe(
        `${definition.path}/new`,
      );
      expect(screen.getByText('Session ended')).toBeDefined();
    });

    it('creates from a deep link without invalidating a list added after submission', async () => {
      const h = setup();
      h.queryClient.removeQueries({ queryKey: definition.key });
      await h.submit();
      const replacement = { items: [{ id: 'fresh-list-query' }] };
      h.queryClient.setQueryData(definition.key, replacement);
      const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
      await act(async () => {
        h.write.resolve(saved);
      });
      await waitFor(() =>
        expect(screen.getByTestId('location').textContent).toBe(
          `${definition.path}/${saved.id}`,
        ),
      );
      expect(invalidate).not.toHaveBeenCalled();
      expect(h.queryClient.getQueryData(definition.key)).toEqual(replacement);
    });

    it('preserves ordinary create, list recovery and result continuation', async () => {
      const h = setup();
      await h.submit();
      expect(h.create).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId }),
      );
      const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
      await act(async () => {
        h.write.resolve(saved);
      });
      await waitFor(() =>
        expect(screen.getByTestId('location').textContent).toBe(
          `${definition.path}/${saved.id}`,
        ),
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: definition.key });
      expect(screen.getByText('Authorized created result')).toBeDefined();
    });
  });
}
