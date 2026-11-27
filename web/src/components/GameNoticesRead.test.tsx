// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamesApi } from '../api/generated/apis/GamesApi';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from '../client/notificationQueries';
import { GameNoticesRead } from './GameNoticesRead';

const SPACE = 'space';

function renderMarker(markGameNoticesRead: GamesApi['markGameNoticesRead']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(notificationUnreadCountQueryKey(SPACE), {
    unreadCount: 2,
  });
  client.setQueryData(notificationsListQueryKey(SPACE), { items: [] });
  const result = render(
    <QueryClientProvider client={client}>
      <GameNoticesRead
        gamesApi={{ markGameNoticesRead }}
        spaceId={SPACE}
        surface="HEART_HUNT"
      />
    </QueryClientProvider>,
  );
  return { client, ...result };
}

afterEach(cleanup);

describe('GameNoticesRead (#2345)', () => {
  it('marks the game notices read once and refreshes the inbox and badge', async () => {
    const mark = vi.fn(async () => undefined);
    const { client, container } = renderMarker(mark);

    expect(container.innerHTML).toBe('');
    await waitFor(() =>
      expect(
        client.getQueryState(notificationUnreadCountQueryKey(SPACE))
          ?.isInvalidated,
      ).toBe(true),
    );
    expect(
      client.getQueryState(notificationsListQueryKey(SPACE))?.isInvalidated,
    ).toBe(true);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith(
      { spaceId: SPACE, surface: 'HEART_HUNT' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('keeps the inbox untouched when the call fails', async () => {
    const mark = vi.fn(async () => {
      throw new Error('offline');
    });
    const { client } = renderMarker(mark);

    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(
      client.getQueryState(notificationUnreadCountQueryKey(SPACE))
        ?.isInvalidated,
    ).toBe(false);
  });
});
