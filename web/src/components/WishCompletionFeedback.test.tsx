// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
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
import { afterEach, expect, it, vi } from 'vitest';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import de from '../i18n/locales/de';
import m5s3 from '../i18n/locales/m5s3';
import { WishProductPage } from './WishProductPage';

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});
const SPACE = 'space-1';
const ID = 'wish-1';
const wish = (overrides: Partial<WishDetail> = {}): WishDetail => ({
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-09-01T10:00:00Z'),
  createdBy: 'account-anna',
  creator: { id: 'account-anna', displayName: 'Anna' },
  id: ID,
  spaceId: SPACE,
  status: 'OPEN',
  title: 'Northern lights',
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  version: 1,
  ...overrides,
});
const fulfilled = () => wish({ status: 'COMPLETED', version: 2 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  let server = wish();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const key = authorSummaryQueryKeys.wishDetail(SPACE, ID);
  queryClient.setQueryData(key, server);
  const writes: ReturnType<typeof deferred<WishDetail>>[] = [];
  const completeWish = vi.fn((_input: unknown) => {
    const write = deferred<WishDetail>();
    writes.push(write);
    return write.promise;
  });
  const getWish = vi.fn(async () => server);
  const convertWishToPlan = vi.fn(() => new Promise<never>(() => {}));
  const updateWish = vi.fn(() => new Promise<never>(() => {}));
  const deleteWish = vi.fn(() => new Promise<never>(() => {}));
  const apis = {
    wishes: { completeWish, getWish, updateWish, deleteWish },
    plans: { convertWishToPlan },
    places: {
      listPlaces: vi.fn(async () => ({
        items: [],
        hasMore: false,
        nextCursor: null,
      })),
    },
  } as unknown as SharedPlanningApis;
  const tree = (spaceId = SPACE) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/plan/wishes/${ID}`]}>
        <Routes>
          <Route
            path="/plan/wishes/:wishId"
            element={<WishProductPage apis={apis} spaceId={spaceId} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    view,
    tree,
    queryClient,
    key,
    writes,
    completeWish,
    getWish,
    convertWishToPlan,
    updateWish,
    deleteWish,
    setServer: (next: WishDetail) => {
      server = next;
    },
  };
}
const action = () =>
  screen.getByRole('button', {
    name: (name) =>
      name === m5s3.wish.complete || name === m5s3.wish.completing,
  });

it('fails an offline attempt without pausing it for automatic reconnect submission', async () => {
  const h = setup();
  const title = screen.getByLabelText(m5s3.wish.planTitle);
  fireEvent.change(title, { target: { value: 'Future trip' } });
  h.completeWish.mockRejectedValueOnce(new ClientProblemError('offline'));
  onlineManager.setOnline(false);
  fireEvent.click(action());

  await screen.findByText(de.states.offline.title);
  expect(h.completeWish).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(m5s3.wish.completePending)).toBeNull();
  expect(title.closest('fieldset')?.disabled).toBe(false);
  expect((title as HTMLInputElement).value).toBe('Future trip');

  await act(async () => onlineManager.setOnline(true));
  expect(h.completeWish).toHaveBeenCalledTimes(1);
  expect(h.queryClient.getQueryData<WishDetail>(h.key)?.status).toBe('OPEN');
  fireEvent.click(action());
  await waitFor(() => expect(h.completeWish).toHaveBeenCalledTimes(2));
  h.setServer(fulfilled());
  await act(async () => h.writes[0].resolve(fulfilled()));
  await screen.findByRole('button', { name: m5s3.wish.createMemory });
});
const conversion = () =>
  screen
    .getByRole('button', { name: m5s3.wish.convert })
    .closest('form') as HTMLFormElement;
async function submit(h: ReturnType<typeof setup>) {
  await screen.findByText('Northern lights');
  fireEvent.click(action());
  await waitFor(() => expect(h.completeWish).toHaveBeenCalledTimes(1));
}
it('claims once in the same task, shows one honest summary status and locks competing writes', async () => {
  const h = setup();
  await screen.findByText('Northern lights');
  const button = action();
  button.focus();
  act(() => {
    button.click();
    button.click();
    conversion().dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  await waitFor(() => expect(h.completeWish).toHaveBeenCalledTimes(1));
  expect(h.completeWish.mock.calls[0]).toMatchObject([
    { spaceId: SPACE, wishId: ID, ifMatch: '1' },
  ]);
  expect((await screen.findByRole('status')).textContent).toBe(
    m5s3.wish.completePending,
  );
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(action().getAttribute('aria-disabled')).toBe('true');
  expect(document.activeElement).toBe(button);
  expect(
    screen
      .getByRole('button', { name: de.common.edit })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.getByLabelText(m5s3.wish.planTitle).closest('fieldset')?.disabled,
  ).toBe(true);
  expect(h.convertWishToPlan).not.toHaveBeenCalled();
  expect(h.queryClient.getQueryData<WishDetail>(h.key)?.status).toBe('OPEN');
  expect(
    screen.queryByRole('button', { name: m5s3.wish.createMemory }),
  ).toBeNull();
});
it('confirms the server version and restores Back focus when the continuation is dismissed', async () => {
  const h = setup();
  await submit(h);
  h.setServer(fulfilled());
  await act(async () => h.writes[0].resolve(fulfilled()));
  const heading = await screen.findByRole('heading', {
    name: m5s3.wish.completionTitle,
  });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(screen.queryByText(m5s3.wish.completePending)).toBeNull();
  expect(h.queryClient.getQueryData<WishDetail>(h.key)?.version).toBe(2);
  fireEvent.click(
    screen.getByRole('button', { name: m5s3.wish.completionDone }),
  );
  expect(screen.getByText(m5s3.wish.completedBody)).toBeDefined();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: m5s3.common.back }),
  );
});
it('retains conversion drafts after failure and permits only an explicit retry', async () => {
  const h = setup();
  fireEvent.change(screen.getByLabelText(m5s3.wish.planTitle), {
    target: { value: 'Later trip' },
  });
  fireEvent.change(screen.getByLabelText(m5s3.common.description), {
    target: { value: 'Keep this draft' },
  });
  await submit(h);
  await act(async () => h.writes[0].reject(new Error('Network failed')));
  await waitFor(() =>
    expect(action().getAttribute('aria-disabled')).toBeNull(),
  );
  expect(screen.queryByText(m5s3.wish.completePending)).toBeNull();
  expect(screen.getByText(de.states.unknown.title)).toBeDefined();
  expect(
    (screen.getByLabelText(m5s3.wish.planTitle) as HTMLInputElement).value,
  ).toBe('Later trip');
  expect(
    (screen.getByLabelText(m5s3.common.description) as HTMLTextAreaElement)
      .value,
  ).toBe('Keep this draft');
  expect(h.completeWish).toHaveBeenCalledTimes(1);
  fireEvent.click(action());
  await waitFor(() => expect(h.completeWish).toHaveBeenCalledTimes(2));
});
it('holds the lock through conflict recovery and uses the refreshed version on explicit retry', async () => {
  const h = setup();
  await submit(h);
  const read = deferred<WishDetail>();
  h.getWish.mockImplementation(() => read.promise);
  await act(async () =>
    h.writes[0].reject(new ClientProblemError('conflict', 409, 'CONFLICT')),
  );
  await waitFor(() => expect(h.getWish).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(m5s3.wish.completePending)).toBeNull();
  expect(screen.getByText(de.states.conflict.title)).toBeDefined();
  expect(action().getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(action());
  fireEvent.submit(conversion());
  expect(h.completeWish).toHaveBeenCalledTimes(1);
  expect(h.convertWishToPlan).not.toHaveBeenCalled();
  await act(async () => read.resolve(wish({ version: 5 })));
  await waitFor(() =>
    expect(action().getAttribute('aria-disabled')).toBeNull(),
  );
  fireEvent.click(action());
  await waitFor(() => expect(h.completeWish).toHaveBeenCalledTimes(2));
  expect(h.completeWish.mock.calls[1]).toMatchObject([{ ifMatch: '5' }]);
});
it('shows partner fulfillment after conflict without claiming our Memory continuation', async () => {
  const h = setup();
  await submit(h);
  h.setServer(fulfilled());
  await act(async () =>
    h.writes[0].reject(new ClientProblemError('conflict', 409, 'CONFLICT')),
  );
  expect(await screen.findByText(m5s3.wish.completedBody)).toBeDefined();
  expect(
    screen.queryByRole('button', { name: m5s3.wish.createMemory }),
  ).toBeNull();
  expect(h.completeWish).toHaveBeenCalledTimes(1);
});
it.each(['completion', 'conversion'])(
  'excludes the competing write when %s starts first in one task',
  async (first) => {
    const h = setup();
    await screen.findByText('Northern lights');
    const complete = () => action().click();
    const convert = () =>
      conversion().dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    act(() => {
      if (first === 'completion') {
        complete();
        convert();
      } else {
        convert();
        complete();
      }
    });
    await waitFor(() =>
      expect(
        h.completeWish.mock.calls.length +
          h.convertWishToPlan.mock.calls.length,
      ).toBe(1),
    );
    expect(h.completeWish).toHaveBeenCalledTimes(
      first === 'completion' ? 1 : 0,
    );
    expect(h.convertWishToPlan).toHaveBeenCalledTimes(
      first === 'conversion' ? 1 : 0,
    );
  },
);
it.each(['update', 'delete'])(
  'prevents completion from racing a pending %s',
  async (kind) => {
    const h = setup();
    fireEvent.click(screen.getByRole('button', { name: de.common.edit }));
    if (kind === 'update')
      fireEvent.submit(
        (screen.getByLabelText(m5s3.common.title) as HTMLInputElement)
          .form as HTMLFormElement,
      );
    else {
      fireEvent.click(screen.getByRole('button', { name: m5s3.common.delete }));
      fireEvent.click(
        screen.getByRole('button', { name: m5s3.common.confirmDelete }),
      );
    }
    fireEvent.click(action());
    await waitFor(() =>
      expect(
        kind === 'update' ? h.updateWish : h.deleteWish,
      ).toHaveBeenCalledTimes(1),
    );
    expect(h.completeWish).not.toHaveBeenCalled();
  },
);
it('keeps pending state and duplicate exclusion across a remount', async () => {
  const h = setup();
  await submit(h);
  h.view.unmount();
  render(h.tree());
  expect((await screen.findByRole('status')).textContent).toBe(
    m5s3.wish.completePending,
  );
  fireEvent.click(action());
  expect(h.completeWish).toHaveBeenCalledTimes(1);
});
it('reconciles an unmounted completion without offering a transient continuation on return', async () => {
  const h = setup();
  await submit(h);
  h.view.unmount();
  h.setServer(fulfilled());
  await act(async () => h.writes[0].resolve(fulfilled()));
  render(h.tree());
  expect(await screen.findByText(m5s3.wish.completedBody)).toBeDefined();
  expect(
    screen.queryByRole('button', { name: m5s3.wish.createMemory }),
  ).toBeNull();
});
it('ignores a late result when the initiating query was replaced in the same Space', async () => {
  const h = setup();
  await submit(h);
  act(() => {
    h.queryClient.clear();
    h.queryClient.setQueryData(
      h.key,
      wish({ title: 'New authorized state', version: 7 }),
    );
  });
  h.view.rerender(h.tree());
  await screen.findByText('New authorized state');
  await act(async () => h.writes[0].resolve(fulfilled()));
  expect(h.queryClient.getQueryData<WishDetail>(h.key)?.version).toBe(7);
  expect(
    screen.queryByRole('button', { name: m5s3.wish.createMemory }),
  ).toBeNull();
});
it('keeps the new Space independent and never recreates a cleared source cache', async () => {
  const h = setup();
  await submit(h);
  const otherKey = authorSummaryQueryKeys.wishDetail('space-2', ID);
  act(() => {
    h.queryClient.clear();
    h.queryClient.setQueryData(
      otherKey,
      wish({ spaceId: 'space-2', title: 'Other Space wish' }),
    );
  });
  h.view.rerender(h.tree('space-2'));
  await screen.findByText('Other Space wish');
  expect(screen.queryByText(m5s3.wish.completePending)).toBeNull();
  expect(action().getAttribute('aria-disabled')).toBeNull();
  await act(async () => h.writes[0].resolve(fulfilled()));
  expect(h.queryClient.getQueryData(h.key)).toBeUndefined();
  expect(h.queryClient.getQueryData<WishDetail>(otherKey)?.status).toBe('OPEN');
  expect(
    screen.queryByRole('button', { name: m5s3.wish.createMemory }),
  ).toBeNull();
});
