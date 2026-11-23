// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GardenHistoryPage } from '../api/generated/models/GardenHistoryPage';
import games from '../i18n/locales/games';
import { GardenHistory, type LoadGardenHistory } from './GardenHistory';

const history = games.garden.history;
const ME = 'me';
const PARTNER = 'partner';
const TODAY = new Date('2026-11-16T00:00:00Z');

const page = (
  items: GardenHistoryPage['items'],
  nextCursor: string | null = null,
): GardenHistoryPage => ({ items, nextCursor, hasMore: nextCursor !== null });

function renderHistory(load: LoadGardenHistory, version: unknown = 1) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = (current: unknown) => (
    <QueryClientProvider client={client}>
      <GardenHistory
        accountId={ME}
        spaceId="space"
        load={load}
        today={TODAY}
        names={{ own: 'Lea', partner: 'Alex' }}
        version={current}
      />
    </QueryClientProvider>
  );
  const view = render(ui(version));
  return { rerender: (next: unknown) => view.rerender(ui(next)) };
}

afterEach(cleanup);

describe('GardenHistory', () => {
  it('tells the newest moments first, grouped by day, and shows more on request', async () => {
    const load = vi
      .fn<LoadGardenHistory>()
      .mockResolvedValueOnce(
        page(
          [
            {
              key: 'SEED_SENT:1',
              kind: 'SEED_SENT',
              happenedOn: TODAY,
              actorId: PARTNER,
              senderId: PARTNER,
              species: 'POPPY',
              words: 'MISS_YOU',
            },
            {
              key: 'SHARED_DAY:2026-11-15',
              kind: 'SHARED_DAY',
              happenedOn: new Date('2026-11-15T00:00:00Z'),
            },
          ],
          'next-1',
        ),
      )
      .mockResolvedValueOnce(
        page([
          {
            key: 'BOUQUET_GIVEN:9',
            kind: 'BOUQUET_GIVEN',
            happenedOn: new Date('2026-11-02T00:00:00Z'),
            actorId: ME,
            flowers: [{ species: 'STARFLOWER', senderId: PARTNER }],
          },
        ]),
      );
    renderHistory(load);

    const section = await screen.findByRole('region', { name: history.title });
    await within(section).findByText(
      history.seedSentPartner.replace('{{name}}', 'Alex'),
    );
    expect(load).toHaveBeenCalledWith(null);
    const days = within(section).getAllByRole('heading', { level: 3 });
    expect(days.map((day) => day.textContent)).toEqual([
      history.today,
      history.yesterday,
    ]);
    expect(within(section).getByText('„Vermiss dich“')).toBeTruthy();
    expect(within(section).getByText(history.sharedDay)).toBeTruthy();
    // No table: a list of moments.
    expect(section.querySelector('table')).toBeNull();

    fireEvent.click(
      within(section).getByRole('button', { name: history.more }),
    );
    await within(section).findByText(
      history.bouquetOwn.replace('{{name}}', 'Alex'),
    );
    expect(load).toHaveBeenLastCalledWith('next-1');
    expect(
      within(section).queryByRole('button', { name: history.more }),
    ).toBeNull();
    expect(screen.getAllByTestId('garden-history-entry')).toHaveLength(3);
  });

  it('starts with a quiet empty state', async () => {
    renderHistory(vi.fn<LoadGardenHistory>().mockResolvedValue(page([])));
    expect(await screen.findByText(history.empty)).toBeTruthy();
  });

  it('offers a retry when the story cannot be read', async () => {
    const load = vi
      .fn<LoadGardenHistory>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([]));
    renderHistory(load);
    fireEvent.click(await screen.findByRole('button', { name: history.retry }));
    expect(await screen.findByText(history.empty)).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('follows the garden when something new happened', async () => {
    const load = vi.fn<LoadGardenHistory>().mockResolvedValue(page([]));
    const view = renderHistory(load, 'first');
    await screen.findByText(history.empty);
    view.rerender('first');
    expect(load).toHaveBeenCalledTimes(1);
    view.rerender('second');
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
