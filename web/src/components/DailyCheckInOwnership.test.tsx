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
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInTodayView } from '../api/generated/models/DailyCheckInTodayView';
import { dailyCheckInTodayQueryKey } from '../client/dailyCheckIn';
import { ClientProblemError } from '../client/problemDetails';
import dailyEnergy from '../i18n/locales/dailyEnergy';
import dailyVibe from '../i18n/locales/dailyVibe';
import de from '../i18n/locales/de';
import { DailyEnergyCheckIn } from './DailyEnergyCheckIn';
import { DailyVibeCheckIn } from './DailyVibeCheckIn';

const clients: QueryClient[] = [];
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
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

function response(projection: DailyCheckInTodayView, etag = '"today:1"') {
  return {
    raw: new Response(null, { status: 200, headers: { ETag: etag } }),
    value: async () => projection,
  };
}

function setup() {
  const current: DailyCheckInTodayView = {
    checkedOn: new Date('2026-10-12T00:00:00Z'),
    dailyContextTimezone: 'Europe/Berlin',
    own: { energyLevel: 60, vibe: null, vibeNote: null, version: 1 },
    energy: {
      visibilityMode: 'MUTUAL_REVEAL',
      partner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
    },
    vibe: {
      visibilityMode: 'MUTUAL_REVEAL',
      partner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
      partnerNote: null,
    },
  };
  let resolve!: (value: ReturnType<typeof response>) => void;
  let reject!: (error: unknown) => void;
  const held = new Promise<ReturnType<typeof response>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const get = vi.fn().mockImplementation(async () => response(current));
  const update = vi.fn().mockReturnValue(held);
  const api = {
    getDailyCheckInTodayRaw: get,
    updateDailyCheckInTodayRaw: update,
  } as unknown as DailyCheckInsApi;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const tree = (accountId = 'account-1', spaceId = 'space-1') => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DailyEnergyCheckIn
          api={api}
          accountId={accountId}
          spaceId={spaceId}
          partnerName="Ben"
        />
        <DailyVibeCheckIn
          api={api}
          accountId={accountId}
          spaceId={spaceId}
          partnerName="Ben"
          configuredEnabled
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return {
    current,
    client,
    get,
    update,
    resolve,
    reject,
    tree,
    mount: () => render(tree()),
  };
}

async function energy(value = 60) {
  const name = dailyEnergy.badgeAriaValue.replace('{{value}}', String(value));
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.getByRole('slider', { name: dailyEnergy.changeLegend });
}

async function saveEnergy(value = 80) {
  const slider = await energy();
  fireEvent.change(slider, { target: { value: String(value) } });
  fireEvent.blur(slider);
}

async function saveVibe() {
  fireEvent.click(
    await screen.findByRole('button', { name: dailyVibe.chooseAria }),
  );
  const sheet = screen.getByRole('dialog', { name: dailyVibe.sheetTitle });
  fireEvent.click(
    within(sheet).getByRole('button', { name: dailyVibe.values.GOOD }),
  );
  fireEvent.change(
    within(sheet).getByPlaceholderText(dailyVibe.notePlaceholder),
    { target: { value: 'An own pending note' } },
  );
  fireEvent.click(within(sheet).getByRole('button', { name: dailyVibe.share }));
}

for (const dimension of ['energy', 'vibe'] as const) {
  it(`retains the pending ${dimension} choice after the ephemeral projection is removed and Today remounts`, async () => {
    const h = setup();
    const first = h.mount();
    if (dimension === 'energy') await saveEnergy();
    else await saveVibe();
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    first.unmount();
    await waitFor(() =>
      expect(
        h.client.getQueryState(
          dailyCheckInTodayQueryKey('account-1', 'space-1'),
        ),
      ).toBeUndefined(),
    );
    h.mount();
    await screen.findByRole('button', {
      name: dailyEnergy.badgeAriaValue.replace(
        '{{value}}',
        dimension === 'energy' ? '80' : '60',
      ),
    });
    if (dimension === 'vibe') {
      expect(
        within(screen.getByTestId('daily-vibe-own')).getByRole('status')
          .textContent,
      ).toBe(dailyVibe.saving);
      fireEvent.click(screen.getByTestId('daily-vibe-own'));
      expect(screen.queryByRole('dialog')).toBeNull();
    } else {
      const slider = await energy(80);
      expect(slider).toHaveProperty('value', '80');
      expect((slider as HTMLInputElement).disabled).toBe(true);
      fireEvent.change(slider, { target: { value: '90' } });
      fireEvent.blur(slider);
    }
    expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
    expect(h.update).toHaveBeenCalledTimes(1);
    await act(async () => h.resolve(response(h.current)));
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
  });
}

it('excludes a competing dimension while the same DailyCheckIn root has a pending write', async () => {
  const h = setup();
  h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const choose = await screen.findByRole('button', {
    name: dailyVibe.chooseAria,
  });
  fireEvent.click(choose);
  const sheet = screen.queryByRole('dialog', { name: dailyVibe.sheetTitle });
  if (sheet) {
    fireEvent.click(
      within(sheet).getByRole('button', { name: dailyVibe.values.GOOD }),
    );
    fireEvent.click(
      within(sheet).getByRole('button', { name: dailyVibe.share }),
    );
  }
  await waitFor(() => expect(h.client.isMutating()).toBe(1));
  expect(h.update).toHaveBeenCalledTimes(1);
  await act(async () => h.resolve(response(h.current)));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
});

it('admits only the first write when release and blur submit different values in one task', async () => {
  const h = setup();
  h.mount();
  const slider = await energy();
  act(() => {
    fireEvent.change(slider, { target: { value: '80' } });
    fireEvent.pointerUp(slider);
    fireEvent.change(slider, { target: { value: '90' } });
    fireEvent.blur(slider);
  });
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
    energyLevel: 80,
  });
  await act(async () => h.resolve(response(h.current)));
});

it('excludes a different dimension submitted in the same task before either observer rerenders', async () => {
  const h = setup();
  h.mount();
  fireEvent.click(
    await screen.findByRole('button', { name: dailyVibe.chooseAria }),
  );
  const sheet = screen.getByRole('dialog', { name: dailyVibe.sheetTitle });
  fireEvent.click(
    within(sheet).getByRole('button', { name: dailyVibe.values.GOOD }),
  );
  const slider = await energy();
  act(() => {
    fireEvent.change(slider, { target: { value: '80' } });
    fireEvent.blur(slider);
    fireEvent.click(
      within(sheet).getByRole('button', { name: dailyVibe.share }),
    );
  });
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
    energyLevel: 80,
  });
  await act(async () => h.resolve(response(h.current)));
});

it('refetches a newer validator on the same query instead of overwriting its confirmed state', async () => {
  const h = setup();
  h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
  const authorized = {
    ...h.current,
    own: { ...h.current.own, energyLevel: 90 },
  };
  h.get.mockResolvedValue(response(authorized, '"today:4"'));
  await act(async () =>
    h.client.setQueryData(key, { projection: authorized, etag: '"today:4"' }),
  );
  await act(async () =>
    h.resolve(
      response(
        { ...h.current, own: { ...h.current.own, energyLevel: 80 } },
        '"today:2"',
      ),
    ),
  );
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(h.client.getQueryData(key)).toMatchObject({
    etag: '"today:4"',
    projection: { own: { energyLevel: 90 } },
  });
});

it('ignores the old timezone context even when the server date remains the same', async () => {
  const h = setup();
  h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
  const changed = { ...h.current, dailyContextTimezone: 'America/New_York' };
  h.get.mockResolvedValue(response(changed, '"zone:1"'));
  await act(async () =>
    h.client.setQueryData(key, { projection: changed, etag: '"zone:1"' }),
  );
  await act(async () =>
    h.resolve(
      response(
        { ...h.current, own: { ...h.current.own, energyLevel: 80 } },
        '"today:2"',
      ),
    ),
  );
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(h.client.getQueryData(key)).toMatchObject({
    etag: '"zone:1"',
    projection: {
      dailyContextTimezone: 'America/New_York',
      own: { energyLevel: 60 },
    },
  });
});

it('reopens a failed own Energy value after return and retries with the new authorized validator', async () => {
  const h = setup();
  const first = h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  first.unmount();
  await act(async () => h.reject(new ClientProblemError('server', 503)));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  h.get.mockResolvedValue(response(h.current, '"today:4"'));
  h.mount();
  const slider = await screen.findByRole('slider', {
    name: dailyEnergy.changeLegend,
  });
  expect(slider).toHaveProperty('value', '80');
  h.update.mockResolvedValueOnce(
    response(
      { ...h.current, own: { ...h.current.own, energyLevel: 80 } },
      '"today:5"',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: de.common.retry }));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0]).toMatchObject({
    ifMatch: '"today:4"',
    dailyCheckInUpdate: { energyLevel: 80 },
  });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
});

it('preserves only the failed own Vibe and note across return until deliberate retry', async () => {
  const h = setup();
  const first = h.mount();
  await saveVibe();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  first.unmount();
  await act(async () => h.reject(new ClientProblemError('server', 503)));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  h.mount();
  const sheet = await screen.findByRole('dialog', {
    name: dailyVibe.sheetTitle,
  });
  expect(
    within(sheet).getByPlaceholderText(dailyVibe.notePlaceholder),
  ).toHaveProperty('value', 'An own pending note');
  expect(
    within(sheet)
      .getByRole('button', { name: dailyVibe.values.GOOD })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
  expect(h.update).toHaveBeenCalledTimes(1);
  h.update.mockResolvedValueOnce(
    response(
      {
        ...h.current,
        own: {
          ...h.current.own,
          vibe: 'GOOD',
          vibeNote: 'An own pending note',
        },
      },
      '"today:2"',
    ),
  );
  fireEvent.click(within(sheet).getByRole('button', { name: dailyVibe.retry }));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0].dailyCheckInUpdate).toEqual({
    vibe: 'GOOD',
    vibeNote: 'An own pending note',
  });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
});

it('retries a failed Vibe removal as a clear rather than resaving the visible choice', async () => {
  const h = setup();
  h.current.own.vibe = 'GOOD';
  h.current.own.vibeNote = 'Own confirmed note';
  const first = h.mount();
  fireEvent.click(await screen.findByTestId('daily-vibe-own'));
  fireEvent.click(screen.getByRole('button', { name: dailyVibe.remove }));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  first.unmount();
  await act(async () => h.reject(new ClientProblemError('server', 503)));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  h.mount();
  const sheet = await screen.findByRole('dialog', {
    name: dailyVibe.sheetTitle,
  });
  h.update.mockResolvedValueOnce(
    response(
      { ...h.current, own: { ...h.current.own, vibe: null, vibeNote: null } },
      '"today:2"',
    ),
  );
  fireEvent.click(within(sheet).getByRole('button', { name: dailyVibe.retry }));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0].dailyCheckInUpdate).toEqual({ vibe: null });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
});

async function submitWithInterruptedRead(
  dimension: 'energy' | 'vibe',
  interrupt: () => void,
) {
  if (dimension === 'energy') {
    const slider = await energy();
    act(() => {
      fireEvent.change(slider, { target: { value: '80' } });
      fireEvent.blur(slider);
      interrupt();
    });
    return;
  }

  fireEvent.click(
    await screen.findByRole('button', { name: dailyVibe.chooseAria }),
  );
  const sheet = screen.getByRole('dialog', { name: dailyVibe.sheetTitle });
  fireEvent.click(
    within(sheet).getByRole('button', { name: dailyVibe.values.GOOD }),
  );
  act(() => {
    fireEvent.click(
      within(sheet).getByRole('button', { name: dailyVibe.share }),
    );
    interrupt();
  });
}

for (const dimension of ['energy', 'vibe'] as const) {
  it(`does not dispatch a stale ${dimension} write after a denied original Today read`, async () => {
    const h = setup();
    h.mount();
    const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
    await submitWithInterruptedRead(dimension, () => {
      h.client
        .getQueryCache()
        .find({ queryKey: key, exact: true })
        ?.setState({
          error: new ClientProblemError('permission', 403),
          status: 'error',
        });
    });

    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(h.update).not.toHaveBeenCalled();
    expect(h.client.getQueryState(key)?.status).toBe('error');
    expect(h.client.getQueryState(key)?.error).toMatchObject({
      kind: 'permission',
    });
  });

  it(`preserves a newer same-Query Today read before dispatching ${dimension}`, async () => {
    const h = setup();
    h.mount();
    const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
    const newer = {
      ...h.current,
      own: {
        ...h.current.own,
        energyLevel: 90,
        vibe: 'GOOD' as const,
        version: 2,
      },
    };
    await submitWithInterruptedRead(dimension, () => {
      h.client.setQueryData(key, { projection: newer, etag: '"today:2"' });
    });

    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(h.update).not.toHaveBeenCalled();
    expect(h.client.getQueryData(key)).toMatchObject({
      etag: '"today:2"',
      projection: { own: { energyLevel: 90, vibe: 'GOOD' } },
    });
  });
}

it('fails a connectivity race without a paused write or automatic reconnect PATCH', async () => {
  const h = setup();
  h.mount();
  const slider = await energy();
  onlineManager.setOnline(false);
  fireEvent.change(slider, { target: { value: '80' } });
  fireEvent.blur(slider);
  await screen.findByText(dailyEnergy.saveError);
  expect(h.update).not.toHaveBeenCalled();
  expect(
    h.client
      .getMutationCache()
      .getAll()
      .every((entry) => !entry.state.isPaused),
  ).toBe(true);
  await act(async () => onlineManager.setOnline(true));
  expect(h.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: de.common.retry }));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  await act(async () => h.resolve(response(h.current)));
});

it('does not retain a confirmed partner projection in mutation state or recreate the removed read cache', async () => {
  const h = setup();
  const first = h.mount();
  await saveVibe();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  first.unmount();
  const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
  await waitFor(() => expect(h.client.getQueryState(key)).toBeUndefined());
  const late = {
    ...h.current,
    vibe: {
      visibilityMode: 'MUTUAL_REVEAL' as const,
      partner: { state: 'VISIBLE' as const, value: 'STRESSED' as const },
      partnerNote: 'Private partner context',
    },
  };
  await act(async () => h.resolve(response(late, '"today:2"')));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(h.client.getQueryState(key)).toBeUndefined();
  for (const entry of h.client.getMutationCache().getAll()) {
    expect(entry.state.data).toBeUndefined();
    expect(JSON.stringify(entry.state)).not.toContain(
      'Private partner context',
    );
    expect(JSON.stringify(entry.state)).not.toContain('projection');
  }
  h.mount();
  await screen.findByRole('button', { name: dailyVibe.chooseAria });
  expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
});

it('uses the replacement consumer read instead of injecting the initiating response after return', async () => {
  const h = setup();
  const first = h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  first.unmount();
  const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
  await waitFor(() => expect(h.client.getQueryState(key)).toBeUndefined());
  h.mount();
  await screen.findByRole('button', {
    name: dailyEnergy.badgeAriaValue.replace('{{value}}', '80'),
  });
  const authorized = {
    ...h.current,
    own: { ...h.current.own, energyLevel: 90 },
  };
  h.get.mockResolvedValue(response(authorized, '"today:3"'));
  const reads = h.get.mock.calls.length;
  await act(async () =>
    h.resolve(
      response(
        { ...h.current, own: { ...h.current.own, energyLevel: 80 } },
        '"today:2"',
      ),
    ),
  );
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(h.get.mock.calls.length).toBeGreaterThan(reads);
  expect(h.client.getQueryData(key)).toMatchObject({
    etag: '"today:3"',
    projection: { own: { energyLevel: 90 } },
  });
});

for (const scope of ['account', 'space'] as const) {
  it(`retires the old request when the ${scope} changes without populating the new scope`, async () => {
    const h = setup();
    const view = h.mount();
    await saveEnergy();
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const accountId = scope === 'account' ? 'account-2' : 'account-1';
    const spaceId = scope === 'space' ? 'space-2' : 'space-1';
    view.rerender(h.tree(accountId, spaceId));
    await screen.findByRole('button', {
      name: dailyEnergy.badgeAriaValue.replace('{{value}}', '60'),
    });
    await act(async () =>
      h.resolve(
        response(
          { ...h.current, own: { ...h.current.own, energyLevel: 80 } },
          '"today:2"',
        ),
      ),
    );
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    expect(
      h.client.getQueryData(dailyCheckInTodayQueryKey(accountId, spaceId)),
    ).toMatchObject({
      etag: '"today:1"',
      projection: { own: { energyLevel: 60 } },
    });
    expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
  });
}

it('retires late responses after session cache clearing even if the same scope returns', async () => {
  const h = setup();
  const first = h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  first.unmount();
  h.client.clear();
  h.mount();
  await screen.findByRole('button', {
    name: dailyEnergy.badgeAriaValue.replace('{{value}}', '60'),
  });
  const reads = h.get.mock.calls.length;
  await act(async () =>
    h.resolve(
      response(
        { ...h.current, own: { ...h.current.own, energyLevel: 80 } },
        '"today:2"',
      ),
    ),
  );
  expect(h.get).toHaveBeenCalledTimes(reads);
  expect(
    h.client.getQueryData(dailyCheckInTodayQueryKey('account-1', 'space-1')),
  ).toMatchObject({
    etag: '"today:1"',
    projection: { own: { energyLevel: 60 } },
  });
});

it('allows an independent server-day attempt and ignores the previous day response', async () => {
  const h = setup();
  h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const tomorrow = {
    ...h.current,
    checkedOn: new Date('2026-10-13T00:00:00Z'),
  };
  h.get.mockResolvedValue(response(tomorrow, '"tomorrow:1"'));
  await act(async () =>
    h.client.setQueryData(dailyCheckInTodayQueryKey('account-1', 'space-1'), {
      projection: tomorrow,
      etag: '"tomorrow:1"',
    }),
  );
  h.update.mockResolvedValueOnce(
    response(
      { ...tomorrow, own: { ...tomorrow.own, energyLevel: 90 } },
      '"tomorrow:2"',
    ),
  );
  await saveEnergy(90);
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0].ifMatch).toBe('"tomorrow:1"');
  await act(async () =>
    h.resolve(
      response(
        { ...h.current, own: { ...h.current.own, energyLevel: 80 } },
        '"today:2"',
      ),
    ),
  );
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(
    h.client.getQueryData(dailyCheckInTodayQueryKey('account-1', 'space-1')),
  ).toMatchObject({
    etag: '"tomorrow:2"',
    projection: { checkedOn: tomorrow.checkedOn, own: { energyLevel: 90 } },
  });
});

for (const outcome of ['success', 'lost-ack'] as const) {
  it(`keeps pending Vibe removal visible after return and observes a confirmed clear before a ${outcome} acknowledgement`, async () => {
    const h = setup();
    h.current.own.vibe = 'GOOD';
    const first = h.mount();
    fireEvent.click(await screen.findByTestId('daily-vibe-own'));
    fireEvent.click(screen.getByRole('button', { name: dailyVibe.remove }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    first.unmount();
    const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
    await waitFor(() => expect(h.client.getQueryState(key)).toBeUndefined());
    h.mount();
    const own = await screen.findByTestId('daily-vibe-own');
    expect(within(own).getByText(dailyVibe.values.GOOD)).not.toBeNull();
    expect(within(own).getByRole('status').textContent).toBe(dailyVibe.saving);
    fireEvent.click(own);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
      vibe: null,
    });
    const cleared = {
      ...h.current,
      own: { ...h.current.own, vibe: null, vibeNote: null },
    };
    h.get.mockResolvedValue(response(cleared, '"today:2"'));
    await act(async () =>
      h.client.setQueryData(key, { projection: cleared, etag: '"today:2"' }),
    );
    expect(await screen.findByText(dailyVibe.saving)).not.toBeNull();
    const choose = screen.getByRole('button', { name: dailyVibe.chooseAria });
    expect(choose.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(choose);
    expect(h.update).toHaveBeenCalledTimes(1);
    if (outcome === 'success') {
      await act(async () => h.resolve(response(cleared, '"today:2"')));
    } else {
      await act(async () => h.reject(new ClientProblemError('server', 503)));
    }
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    await waitFor(() =>
      expect(choose.getAttribute('aria-disabled')).toBe('false'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.update).toHaveBeenCalledTimes(1);
  });
}

it('preserves a newer authorized module/privacy projection even when the owner validator has not changed', async () => {
  const h = setup();
  h.current.own.vibe = 'GOOD';
  h.current.vibe = {
    visibilityMode: 'MUTUAL_REVEAL',
    partner: { state: 'VISIBLE', value: 'STRESSED' },
    partnerNote: 'Private old partner context',
  };
  h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
  const protectedRead = { ...h.current, vibe: null };
  await act(async () =>
    h.client.setQueryData(key, {
      projection: protectedRead,
      etag: '"today:1"',
    }),
  );
  const confirmedRead = {
    ...protectedRead,
    own: { ...protectedRead.own, energyLevel: 80, version: 2 },
  };
  h.get.mockResolvedValue(response(confirmedRead, '"today:2"'));
  const late = {
    ...h.current,
    own: { ...h.current.own, energyLevel: 80, version: 2 },
  };
  await act(async () => h.resolve(response(late, '"today:2"')));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(h.client.getQueryData(key)).toMatchObject({
    etag: '"today:2"',
    projection: { vibe: null, own: { energyLevel: 80 } },
  });
  expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
  expect(screen.queryByText('Private old partner context')).toBeNull();
});

it('does not reset a newer authorized Today read after an old write fails with 403', async () => {
  const h = setup();
  h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
  const newer = {
    ...h.current,
    own: { ...h.current.own, energyLevel: 90, version: 2 },
  };
  h.get.mockResolvedValue(response(newer, '"today:3"'));
  await act(async () =>
    h.client.setQueryData(key, { projection: newer, etag: '"today:3"' }),
  );
  const reads = h.get.mock.calls.length;
  await act(async () => h.reject(new ClientProblemError('permission', 403)));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(h.get).toHaveBeenCalledTimes(reads);
  expect(h.client.getQueryData(key)).toMatchObject({
    etag: '"today:3"',
    projection: { own: { energyLevel: 90 } },
  });
});

it('does not turn a newer denied read into a successful private projection when an older write completes', async () => {
  const h = setup();
  h.current.own.vibe = 'GOOD';
  h.current.vibe = {
    visibilityMode: 'MUTUAL_REVEAL',
    partner: { state: 'VISIBLE', value: 'STRESSED' },
    partnerNote: 'Private old partner context',
  };
  h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
  h.get.mockRejectedValue(new ClientProblemError('permission', 403));
  await act(async () =>
    h.client.refetchQueries({ queryKey: key, exact: true }),
  );
  expect(h.client.getQueryState(key)?.status).toBe('error');
  const deniedReads = h.get.mock.calls.length;
  await act(async () =>
    h.resolve(
      response(
        {
          ...h.current,
          own: { ...h.current.own, energyLevel: 80, version: 2 },
        },
        '"today:2"',
      ),
    ),
  );
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(h.get).toHaveBeenCalledTimes(deniedReads);
  expect(h.client.getQueryState(key)?.status).toBe('error');
  expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
});
