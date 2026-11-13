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
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInTodayView } from '../api/generated/models/DailyCheckInTodayView';
import type { DailyVibe } from '../api/generated/models/DailyVibe';
import { dailyCheckInTodayQueryKey } from '../client/dailyCheckIn';
import { ClientProblemError } from '../client/problemDetails';
import dailyVibe from '../i18n/locales/dailyVibe';
import wirCheckIn from '../i18n/locales/wirCheckIn';
import { useWirDailyCheckIn } from './WirDailyCheckIn';

/**
 * Concurrency and privacy contract of the shared DailyCheckIn write hook,
 * exercised through the Wir check-in (#1790 slice A). Both dimensions share
 * one mutation key, so at most one write is in flight at a time.
 */

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function response(projection: DailyCheckInTodayView, etag = '"today:1"') {
  return {
    raw: new Response(null, { status: 200, headers: { ETag: etag } }),
    value: async () => projection,
  };
}

function Harness({
  api,
  accountId,
  spaceId,
}: {
  api: DailyCheckInsApi;
  accountId: string;
  spaceId: string;
}) {
  const checkIn = useWirDailyCheckIn({
    api,
    accountId,
    spaceId,
    partnerName: 'Ben',
    vibeEnabled: true,
    energyEnabled: true,
  });
  if (!checkIn) return null;
  return (
    <div>
      <button
        type="button"
        data-testid="own-trigger"
        aria-label={checkIn.ownAction.label}
        aria-expanded={checkIn.ownAction.expanded}
        ref={checkIn.ownAction.ref}
        onClick={checkIn.ownAction.onActivate}
      />
      {checkIn.ownBadge}
      {checkIn.partnerBadge}
      {checkIn.panel}
      {checkIn.partnerBlock}
      {checkIn.announcement}
    </div>
  );
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
      <Harness api={api} accountId={accountId} spaceId={spaceId} />
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

function ownLabel(parts: string[]) {
  return wirCheckIn.ownAria.replace(
    '{{summary}}',
    parts.join(wirCheckIn.summarySeparator),
  );
}

function energyPart(value: number) {
  return wirCheckIn.summaryEnergy.replace('{{value}}', String(value));
}

async function ownTrigger(label?: string) {
  await screen.findByTestId('wir-checkin-own-badge');
  const trigger = screen.getByTestId('own-trigger');
  if (label)
    await waitFor(() => expect(trigger.getAttribute('aria-label')).toBe(label));
  return trigger;
}

async function openPanel() {
  const trigger = await ownTrigger();
  if (trigger.getAttribute('aria-expanded') !== 'true')
    fireEvent.click(trigger);
}

async function energy() {
  await openPanel();
  return screen.getByRole('slider', {
    name: wirCheckIn.energySliderLabel,
  }) as HTMLInputElement;
}

async function saveEnergy(value = 80) {
  const slider = await energy();
  fireEvent.change(slider, { target: { value: String(value) } });
  fireEvent.blur(slider);
}

function vibeButton(value: DailyVibe) {
  return screen.getByRole('button', { name: dailyVibe.values[value] });
}

async function saveVibe(value: DailyVibe = 'GOOD') {
  await openPanel();
  fireEvent.click(vibeButton(value));
}

function partnerState() {
  return (
    screen
      .queryByTestId('wir-checkin-partner-badge')
      ?.getAttribute('data-state') ?? null
  );
}

function ownPending() {
  return screen
    .getByTestId('wir-checkin-own-badge')
    .getAttribute('data-pending');
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
    await ownTrigger(
      dimension === 'energy'
        ? ownLabel([energyPart(80)])
        : ownLabel([dailyVibe.values.GOOD, energyPart(60)]),
    );
    expect(ownPending()).toBe('true');
    await openPanel();
    expect(screen.getByText(wirCheckIn.saving)).not.toBeNull();
    // A further choice waits for the pending write instead of racing it.
    if (dimension === 'energy') {
      const slider = await energy();
      expect(slider.value).toBe('80');
      fireEvent.change(slider, { target: { value: '90' } });
      fireEvent.blur(slider);
    } else {
      expect(vibeButton('GOOD').getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(vibeButton('SAD'));
    }
    expect(partnerState()).toBe('hidden');
    expect(h.update).toHaveBeenCalledTimes(1);
    await act(async () => h.resolve(response(h.current)));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
    expect(h.update.mock.calls[1][0].dailyCheckInUpdate).toEqual(
      dimension === 'energy' ? { energyLevel: 90 } : { vibe: 'SAD' },
    );
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
  });
}

it('excludes a competing dimension while the same DailyCheckIn root has a pending write', async () => {
  const h = setup();
  h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  fireEvent.click(vibeButton('GOOD'));
  await waitFor(() => expect(h.client.isMutating()).toBe(1));
  expect(h.update).toHaveBeenCalledTimes(1);
  await act(async () => h.resolve(response(h.current)));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0].dailyCheckInUpdate).toEqual({
    vibe: 'GOOD',
  });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
});

it('admits only the first write when release and blur submit different values before observers rerender', async () => {
  const h = setup();
  h.mount();
  const slider = await energy();
  fireEvent.change(slider, { target: { value: '80' } });
  fireEvent.pointerUp(slider);
  fireEvent.change(slider, { target: { value: '90' } });
  fireEvent.blur(slider);
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
    energyLevel: 80,
  });
  expect(h.client.isMutating()).toBe(1);
  await act(async () => h.resolve(response(h.current)));
  // The later value is serialized after the first, never sent concurrently.
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0].dailyCheckInUpdate).toEqual({
    energyLevel: 90,
  });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
});

it('excludes a different dimension submitted before either observer rerenders', async () => {
  const h = setup();
  h.mount();
  const slider = await energy();
  fireEvent.change(slider, { target: { value: '80' } });
  fireEvent.blur(slider);
  fireEvent.click(vibeButton('GOOD'));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
    energyLevel: 80,
  });
  expect(h.client.isMutating()).toBe(1);
  await act(async () => h.resolve(response(h.current)));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0].dailyCheckInUpdate).toEqual({
    vibe: 'GOOD',
  });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
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

it('reopens the panel for a failed own Energy value after return and retries with the new authorized validator', async () => {
  const h = setup();
  const first = h.mount();
  await saveEnergy();
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  first.unmount();
  await act(async () => h.reject(new ClientProblemError('server', 503)));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  h.get.mockResolvedValue(response(h.current, '"today:4"'));
  h.mount();
  const retry = await screen.findByRole('button', { name: wirCheckIn.retry });
  expect(screen.getByText(wirCheckIn.saveError)).not.toBeNull();
  // The failed value is not shown as saved; the confirmed value stays.
  expect(
    (
      screen.getByRole('slider', {
        name: wirCheckIn.energySliderLabel,
      }) as HTMLInputElement
    ).value,
  ).toBe('60');
  expect(h.update).toHaveBeenCalledTimes(1);
  h.update.mockResolvedValueOnce(
    response(
      { ...h.current, own: { ...h.current.own, energyLevel: 80 } },
      '"today:5"',
    ),
  );
  fireEvent.click(retry);
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0]).toMatchObject({
    ifMatch: '"today:4"',
    dailyCheckInUpdate: { energyLevel: 80 },
  });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
});

it('preserves only the failed own Vibe and note across return until deliberate retry', async () => {
  const h = setup();
  h.current.own.vibe = 'OKAY';
  const first = h.mount();
  await openPanel();
  fireEvent.change(
    screen.getByRole('textbox', { name: wirCheckIn.noteLabel }),
    { target: { value: 'An own pending note' } },
  );
  fireEvent.click(vibeButton('GOOD'));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
    vibe: 'GOOD',
    vibeNote: 'An own pending note',
  });
  first.unmount();
  await act(async () => h.reject(new ClientProblemError('server', 503)));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  h.mount();
  const retry = await screen.findByRole('button', { name: wirCheckIn.retry });
  expect(vibeButton('OKAY').getAttribute('aria-pressed')).toBe('true');
  expect(partnerState()).toBe('hidden');
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
  fireEvent.click(retry);
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
  await saveVibe('GOOD');
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({ vibe: null });
  first.unmount();
  await act(async () => h.reject(new ClientProblemError('server', 503)));
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  h.mount();
  const retry = await screen.findByRole('button', { name: wirCheckIn.retry });
  expect(vibeButton('GOOD').getAttribute('aria-pressed')).toBe('true');
  h.update.mockResolvedValueOnce(
    response(
      { ...h.current, own: { ...h.current.own, vibe: null, vibeNote: null } },
      '"today:2"',
    ),
  );
  fireEvent.click(retry);
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
  expect(h.update.mock.calls[1][0].dailyCheckInUpdate).toEqual({ vibe: null });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
});

it('keeps a valid Energy tap during a cancellable background Today refresh', async () => {
  const h = setup();
  h.mount();
  const slider = await energy();
  const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
  let releaseRead: (value: ReturnType<typeof response>) => void = () => {};
  h.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseRead = resolve;
      }),
  );
  void h.client.refetchQueries({ queryKey: key, exact: true });
  await waitFor(() =>
    expect(h.client.getQueryState(key)?.fetchStatus).toBe('fetching'),
  );

  fireEvent.change(slider, { target: { value: '80' } });
  fireEvent.blur(slider);
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].ifMatch).toBe('"today:1"');

  const confirmed = {
    ...h.current,
    own: { ...h.current.own, energyLevel: 80, version: 2 },
  };
  await act(async () => {
    releaseRead(response(h.current));
    h.resolve(response(confirmed, '"today:2"'));
  });
  await waitFor(() => expect(h.client.isMutating()).toBe(0));
  expect(h.client.getQueryData(key)).toMatchObject({
    etag: '"today:2"',
    projection: { own: { energyLevel: 80 } },
  });
});

async function submitWithInterruptedRead(
  dimension: 'energy' | 'vibe',
  interrupt: () => void,
) {
  if (dimension === 'energy') {
    const slider = await energy();
    fireEvent.change(slider, { target: { value: '80' } });
    act(() => {
      fireEvent.blur(slider);
      interrupt();
    });
    return;
  }
  await openPanel();
  act(() => {
    fireEvent.click(vibeButton('GOOD'));
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

    expect(h.client.getMutationCache().getAll()).toHaveLength(1);
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

    expect(h.client.getMutationCache().getAll()).toHaveLength(1);
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
  await screen.findByText(wirCheckIn.saveError);
  expect(h.update).not.toHaveBeenCalled();
  expect(
    h.client
      .getMutationCache()
      .getAll()
      .every((entry) => !entry.state.isPaused),
  ).toBe(true);
  await act(async () => onlineManager.setOnline(true));
  expect(h.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: wirCheckIn.retry }));
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
    energyLevel: 80,
  });
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
  await ownTrigger();
  expect(partnerState()).toBe('hidden');
  expect(document.querySelector('[data-vibe-icon="STRESSED"]')).toBeNull();
  expect(screen.queryByText('Private partner context')).toBeNull();
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
  await ownTrigger(ownLabel([energyPart(80)]));
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
    await ownTrigger(ownLabel([energyPart(60)]));
    expect(ownPending()).toBeNull();
    expect(
      screen.getByTestId('own-trigger').getAttribute('aria-expanded'),
    ).toBe('false');
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
    expect(partnerState()).toBe('hidden');
    expect(screen.getByTestId('own-trigger').getAttribute('aria-label')).toBe(
      ownLabel([energyPart(60)]),
    );
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
  await ownTrigger(ownLabel([energyPart(60)]));
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
  // A new day starts from the server again: the panel closes, nothing pends.
  await waitFor(() =>
    expect(
      screen.getByTestId('own-trigger').getAttribute('aria-expanded'),
    ).toBe('false'),
  );
  expect(ownPending()).toBeNull();
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
    await saveVibe('GOOD');
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
      vibe: null,
    });
    first.unmount();
    const key = dailyCheckInTodayQueryKey('account-1', 'space-1');
    await waitFor(() => expect(h.client.getQueryState(key)).toBeUndefined());
    h.mount();
    // The own pending removal shows as removed, never as the old value.
    await ownTrigger(ownLabel([energyPart(60)]));
    expect(ownPending()).toBe('true');
    expect(
      screen
        .getByTestId('wir-checkin-own-badge')
        .querySelector('[data-vibe-icon]'),
    ).toBeNull();
    const cleared = {
      ...h.current,
      own: { ...h.current.own, vibe: null, vibeNote: null },
    };
    h.get.mockResolvedValue(response(cleared, '"today:2"'));
    await act(async () =>
      h.client.setQueryData(key, { projection: cleared, etag: '"today:2"' }),
    );
    await openPanel();
    expect(screen.getByText(wirCheckIn.saving)).not.toBeNull();
    expect(vibeButton('GOOD').getAttribute('aria-pressed')).toBe('false');
    expect(h.update).toHaveBeenCalledTimes(1);
    if (outcome === 'success') {
      await act(async () => h.resolve(response(cleared, '"today:2"')));
    } else {
      await act(async () => h.reject(new ClientProblemError('server', 503)));
    }
    await waitFor(() => expect(h.client.isMutating()).toBe(0));
    await waitFor(() => expect(ownPending()).toBeNull());
    expect(screen.queryByText(wirCheckIn.saving)).toBeNull();
    // The removal is already confirmed by the authorized read: no error.
    expect(screen.queryByText(wirCheckIn.saveError)).toBeNull();
    expect(screen.queryByRole('button', { name: wirCheckIn.retry })).toBeNull();
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
  await ownTrigger();
  expect(screen.getByText('Private old partner context')).not.toBeNull();
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
  expect(document.querySelector('[data-vibe-icon="STRESSED"]')).toBeNull();
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
  // A denied read must not keep presenting the earlier private projection.
  expect(partnerState()).not.toBe('visible');
  expect(
    document.querySelector(
      '[data-testid="wir-checkin-partner-badge"], [data-testid="wir-checkin-partner-block"]',
    ),
  ).toBeNull();
  expect(screen.queryByText('Private old partner context')).toBeNull();
});
