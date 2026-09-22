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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInTodayView } from '../api/generated/models/DailyCheckInTodayView';
import type { DailyVibe } from '../api/generated/models/DailyVibe';
import { dailyCheckInTodayQueryKey } from '../client/dailyCheckIn';
import { ClientProblemError } from '../client/problemDetails';
import dailyVibe from '../i18n/locales/dailyVibe';
import { DailyVibeCheckIn } from './DailyVibeCheckIn';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

type VibePartner =
  | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
  | { state: 'NO_CHECK_IN' }
  | { state: 'VISIBLE'; value: DailyVibe };

function projection({
  ownVibe = null,
  ownVibeNote = null,
  ownEnergy = 60,
  partner = { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' } as const,
  partnerVibeNote = null,
  vibeEnabled = true,
  vibeVisibilityMode = 'MUTUAL_REVEAL' as const,
  energyPartner = { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' } as const,
}: {
  ownVibe?: DailyVibe | null;
  ownVibeNote?: string | null;
  ownEnergy?: number | null;
  partner?: VibePartner;
  partnerVibeNote?: string | null;
  vibeEnabled?: boolean;
  vibeVisibilityMode?: 'IMMEDIATE' | 'MUTUAL_REVEAL';
  energyPartner?:
    | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
    | { state: 'NO_CHECK_IN' }
    | { state: 'VISIBLE'; value: number };
} = {}): DailyCheckInTodayView {
  return {
    checkedOn: new Date('2026-09-21T00:00:00.000Z'),
    dailyContextTimezone: 'Europe/Berlin',
    own: {
      energyLevel: ownEnergy,
      vibe: ownVibe,
      vibeNote: ownVibeNote,
      version: ownVibe === null && ownEnergy === null ? 0 : 1,
    },
    energy: {
      visibilityMode: 'MUTUAL_REVEAL',
      partner: energyPartner,
    },
    vibe: vibeEnabled
      ? {
          visibilityMode: vibeVisibilityMode,
          partner,
          partnerNote: partnerVibeNote,
        }
      : null,
  };
}

function rawResponse(value: DailyCheckInTodayView, etag: string) {
  return {
    raw: new Response(null, { status: 200, headers: { ETag: etag } }),
    value: async () => value,
  };
}

function renderVibe(
  api: DailyCheckInsApi,
  {
    accountId = 'account-1',
    spaceId = 'space-1',
    configuredEnabled = true,
    partnerName = 'Marie Winter',
  }: {
    accountId?: string;
    spaceId?: string;
    configuredEnabled?: boolean;
    partnerName?: string;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DailyVibeCheckIn
        api={api}
        accountId={accountId}
        spaceId={spaceId}
        partnerName={partnerName}
        configuredEnabled={configuredEnabled}
      />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

async function openVibeSheet(name: string = dailyVibe.chooseAria) {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.getByRole('dialog', { name: dailyVibe.sheetTitle });
}

function changeAria(value: string): string {
  return dailyVibe.changeAria.replace('{{value}}', value);
}

describe('DailyVibeCheckIn', () => {
  it('offers all six semantic values without rendering an empty or hidden person', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(), '"today:1"')),
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    await screen.findByRole('button', { name: dailyVibe.chooseAria });
    expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
    expect(screen.queryByText(dailyVibe.partnerHidden)).toBeNull();
    expect(screen.queryByText(dailyVibe.voluntary)).toBeNull();

    const dialog = await openVibeSheet();
    for (const label of Object.values(dailyVibe.values)) {
      expect(
        within(dialog).getByRole('button', { name: label }),
      ).not.toBeNull();
    }
  });

  it('keeps the Vibe sheet open while partner sync refetches in the background', async () => {
    let resolveRefetch:
      | ((value: ReturnType<typeof rawResponse>) => void)
      | undefined;
    const backgroundRefetch = new Promise<ReturnType<typeof rawResponse>>(
      (resolve) => {
        resolveRefetch = resolve;
      },
    );
    const initial = rawResponse(
      projection({
        ownVibe: 'GOOD',
        partner: { state: 'VISIBLE', value: 'STRESSED' },
      }),
      '"today:1"',
    );
    const getDailyCheckInTodayRaw = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(backgroundRefetch);
    const api = {
      getDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    const { queryClient } = renderVibe(api);
    await openVibeSheet(changeAria(dailyVibe.values.GOOD));

    void queryClient.refetchQueries({
      queryKey: dailyCheckInTodayQueryKey('account-1', 'space-1'),
      exact: true,
    });
    await waitFor(() =>
      expect(getDailyCheckInTodayRaw).toHaveBeenCalledTimes(2),
    );

    expect(
      screen.getByRole('dialog', { name: dailyVibe.sheetTitle }),
    ).not.toBeNull();

    resolveRefetch?.(
      rawResponse(
        projection({
          ownVibe: 'GOOD',
          partner: { state: 'VISIBLE', value: 'GOOD' },
        }),
        '"today:1"',
      ),
    );
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(
      screen.getByRole('dialog', { name: dailyVibe.sheetTitle }),
    ).not.toBeNull();
    await waitFor(() =>
      expect(
        within(screen.getByTestId('daily-vibe-partner')).getByText(
          dailyVibe.values.GOOD,
        ),
      ).not.toBeNull(),
    );
  });

  it('sets Vibe with the shared full-owner ETag and never patches Energy', async () => {
    const update = vi.fn().mockResolvedValue(
      rawResponse(
        projection({
          ownVibe: 'GOOD',
          ownEnergy: 60,
          partner: { state: 'VISIBLE', value: 'STRESSED' },
          energyPartner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
        }),
        '"today:2"',
      ),
    );
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(
          rawResponse(projection({ ownEnergy: 60 }), '"today:1"'),
        ),
      updateDailyCheckInTodayRaw: update,
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    const dialog = await openVibeSheet();
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.values.GOOD }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.share }),
    );

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"today:1"',
        dailyCheckInUpdate: { vibe: 'GOOD', vibeNote: null },
      }),
    );
    expect(
      await screen.findByRole('button', {
        name: changeAria(dailyVibe.values.GOOD),
      }),
    ).not.toBeNull();
    const partner = screen.getByTestId('daily-vibe-partner');
    expect(within(partner).getByText(dailyVibe.values.STRESSED)).not.toBeNull();
    expect(within(partner).getByText('Marie')).not.toBeNull();
    expect(within(partner).queryByText('Marie Winter')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Marie');
  });

  it('shares an optional context note atomically with the selected Vibe', async () => {
    const note = "Today's appointment finally went better than expected.";
    const update = vi.fn().mockResolvedValue(
      rawResponse(
        projection({
          ownVibe: 'GOOD',
          ownVibeNote: note,
          partner: { state: 'NO_CHECK_IN' },
        }),
        '"today:2"',
      ),
    );
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(), '"today:1"')),
      updateDailyCheckInTodayRaw: update,
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    const dialog = await openVibeSheet();
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.values.GOOD }),
    );
    fireEvent.change(
      within(dialog).getByPlaceholderText(dailyVibe.notePlaceholder),
      { target: { value: note } },
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.share }),
    );

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"today:1"',
        dailyCheckInUpdate: { vibe: 'GOOD', vibeNote: note },
      }),
    );
  });

  it('keeps partner context out of Today until the visible Vibe card is opened', async () => {
    const note = 'My head feels a little empty today. A quiet evening would be nice.';
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            ownVibe: 'GOOD',
            partner: { state: 'VISIBLE', value: 'OKAY' },
            partnerVibeNote: note,
          }),
          '"today:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    await screen.findByTestId('daily-vibe-partner');
    expect(screen.queryByText(note)).toBeNull();

    const partnerButton = screen.getByRole('button', {
      name: dailyVibe.partnerContextAria
        .replace('{{name}}', 'Marie')
        .replace('{{value}}', dailyVibe.values.OKAY),
    });
    fireEvent.click(partnerButton);

    const detail = screen.getByRole('dialog', {
      name: dailyVibe.partnerNoteTitle.replace('{{name}}', 'Marie'),
    });
    expect(within(detail).getByText(note)).not.toBeNull();
    expect(within(detail).getByText(dailyVibe.values.OKAY)).not.toBeNull();
  });

  it('never exposes a partner context note before the Vibe itself is visible', async () => {
    const note = 'This must stay hidden.';
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            partner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
            partnerVibeNote: note,
          }),
          '"today:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    await screen.findByRole('button', { name: dailyVibe.chooseAria });
    expect(screen.queryByText(note)).toBeNull();
    expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
  });

  it('changes and removes only the Vibe dimension', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce(
        rawResponse(
          projection({
            ownVibe: 'NEEDS_SPACE',
            partner: { state: 'VISIBLE', value: 'GOOD' },
          }),
          '"today:2"',
        ),
      )
      .mockResolvedValueOnce(
        rawResponse(
          projection({
            ownVibe: null,
            partner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
          }),
          '"today:3"',
        ),
      );
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            ownVibe: 'OKAY',
            partner: { state: 'VISIBLE', value: 'GOOD' },
          }),
          '"today:1"',
        ),
      ),
      updateDailyCheckInTodayRaw: update,
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    let dialog = await openVibeSheet(changeAria(dailyVibe.values.OKAY));
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: dailyVibe.values.NEEDS_SPACE,
      }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.saveChanges }),
    );
    await screen.findByRole('button', {
      name: changeAria(dailyVibe.values.NEEDS_SPACE),
    });

    dialog = await openVibeSheet(changeAria(dailyVibe.values.NEEDS_SPACE));
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.remove }),
    );

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
      vibe: 'NEEDS_SPACE',
      vibeNote: null,
    });
    expect(update.mock.calls[1][0].dailyCheckInUpdate).toEqual({ vibe: null });
    expect(
      await screen.findByRole('button', { name: dailyVibe.chooseAria }),
    ).not.toBeNull();
    expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
  });

  it('animates populated Vibe cards each time the Today surface is mounted', async () => {
    const getToday = vi.fn().mockResolvedValue(
      rawResponse(
        projection({
          ownVibe: 'GOOD',
          partner: { state: 'VISIBLE', value: 'STRESSED' },
        }),
        '"today:1"',
      ),
    );
    const api = {
      getDailyCheckInTodayRaw: getToday,
    } as unknown as DailyCheckInsApi;

    const first = renderVibe(api);
    const own = await screen.findByRole('button', {
      name: changeAria(dailyVibe.values.GOOD),
    });
    expect(own.classList.contains('is-startup-reveal')).toBe(true);
    expect(
      screen
        .getByTestId('daily-vibe-partner')
        .classList.contains('is-startup-reveal'),
    ).toBe(true);
    first.unmount();

    renderVibe(api);
    const ownAgain = await screen.findByRole('button', {
      name: changeAria(dailyVibe.values.GOOD),
    });
    expect(ownAgain.classList.contains('is-startup-reveal')).toBe(true);
    expect(
      screen
        .getByTestId('daily-vibe-partner')
        .classList.contains('is-startup-reveal'),
    ).toBe(true);
  });

  it('refetches a stale ETag conflict without retrying the mutation', async () => {
    const getToday = vi
      .fn()
      .mockResolvedValueOnce(
        rawResponse(projection({ ownVibe: 'GOOD' }), '"today:1"'),
      )
      .mockResolvedValue(
        rawResponse(projection({ ownVibe: 'SAD' }), '"today:2"'),
      );
    const update = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError('conflict', 409, 'RESOURCE_VERSION_CONFLICT'),
      );
    const api = {
      getDailyCheckInTodayRaw: getToday,
      updateDailyCheckInTodayRaw: update,
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    const dialog = await openVibeSheet(changeAria(dailyVibe.values.GOOD));
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.values.STRESSED }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.saveChanges }),
    );

    await waitFor(() => expect(getToday).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', {
        name: changeAria(dailyVibe.values.SAD),
      }),
    ).not.toBeNull();
  });

  it('shows a save error without weakening the current snapshot', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(), '"today:1"')),
      updateDailyCheckInTodayRaw: vi
        .fn()
        .mockRejectedValue(new ClientProblemError('server', 500, 'BROKEN')),
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    const dialog = await openVibeSheet();
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.values.SAD }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.share }),
    );
    expect(await screen.findByText(dailyVibe.saveError)).not.toBeNull();
    expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
  });

  it('omits IMMEDIATE NO_CHECK_IN and renders only an actual partner Vibe', async () => {
    const apiNo = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            partner: { state: 'NO_CHECK_IN' },
            vibeVisibilityMode: 'IMMEDIATE',
          }),
          '"today:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;
    const first = renderVibe(apiNo);
    await screen.findByRole('button', { name: dailyVibe.chooseAria });
    expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
    expect(screen.queryByText(dailyVibe.noCheckIn)).toBeNull();
    first.unmount();

    const apiVisible = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            partner: { state: 'VISIBLE', value: 'NEEDS_CONNECTION' },
            vibeVisibilityMode: 'IMMEDIATE',
          }),
          '"today:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;
    renderVibe(apiVisible);
    expect(
      within(await screen.findByTestId('daily-vibe-partner')).getByText(
        dailyVibe.values.NEEDS_CONNECTION,
      ),
    ).not.toBeNull();
    expect(document.body.textContent).not.toContain('NEEDS_CONNECTION');
  });

  it('does not query or render when Vibe is disabled by configuration', () => {
    const getDailyCheckInTodayRaw = vi.fn();
    const api = {
      getDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    renderVibe(api, { configuredEnabled: false });

    expect(screen.queryByTestId('daily-vibe-checkin')).toBeNull();
    expect(screen.queryByTestId('daily-vibe-disabled-clear')).toBeNull();
    expect(getDailyCheckInTodayRaw).not.toHaveBeenCalled();
  });

  it('drops the partner projection while offline instead of replaying it as today', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            ownVibe: 'GOOD',
            partner: { state: 'VISIBLE', value: 'STRESSED' },
          }),
          '"today:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    await screen.findByText(dailyVibe.values.STRESSED);
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event('offline'));

    await waitFor(() => {
      expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
      expect(screen.getByText(dailyVibe.unavailableOffline)).not.toBeNull();
    });
  });
});
