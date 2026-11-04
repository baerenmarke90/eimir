// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutoLoadMore } from './AutoLoadMore';

const observers: { run: () => void; active: boolean }[] = [];
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      entry: { run: () => void; active: boolean };
      constructor(callback: IntersectionObserverCallback) {
        this.entry = {
          active: true,
          run: () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            ),
        };
        observers.push(this.entry);
      }
      observe() {}
      disconnect() {
        this.entry.active = false;
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const intersect = async () =>
  act(async () => {
    for (const item of observers) if (item.active) item.run();
  });
const makeQuery = () => ({
  data: {
    pages: [{ nextCursor: 'a' }],
    pageParams: [null] as (string | null)[],
  },
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetching: false,
  isError: false,
  fetchNextPage: vi.fn().mockResolvedValue({ isError: false }),
});

it('loads each cursor once as scrolling reaches it, with no ordinary load button', async () => {
  const query = makeQuery();
  const view = render(<AutoLoadMore query={query}>More</AutoLoadMore>);
  expect(screen.queryByRole('button')).toBeNull();
  await intersect();
  await intersect();
  expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  query.data = {
    pages: [{ nextCursor: 'a' }, { nextCursor: 'b' }],
    pageParams: [null, 'a'],
  };
  view.rerender(<AutoLoadMore query={query}>More</AutoLoadMore>);
  await intersect();
  expect(query.fetchNextPage).toHaveBeenCalledTimes(2);
  expect(query.fetchNextPage).toHaveBeenLastCalledWith({
    cancelRefetch: false,
  });
});

it('stops after a failed page and retries only after a deliberate action', async () => {
  const query = makeQuery();
  query.fetchNextPage.mockResolvedValue({ isError: true });
  render(<AutoLoadMore query={query}>Retry</AutoLoadMore>);
  await intersect();
  await intersect();
  expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await act(async () => undefined);
  expect(query.fetchNextPage).toHaveBeenCalledTimes(2);
});

it('rejects repeated cursors instead of continuously appending the same page', async () => {
  const query = makeQuery();
  query.data.pageParams = [null, 'a'];
  render(<AutoLoadMore query={query}>More</AutoLoadMore>);
  await intersect();
  expect(query.fetchNextPage).not.toHaveBeenCalled();
});
