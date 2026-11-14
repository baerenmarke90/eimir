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
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInTodayView } from '../api/generated/models/DailyCheckInTodayView';
import type { DailyVibe } from '../api/generated/models/DailyVibe';
import { dailyCheckInTodayQueryKey } from '../client/dailyCheckIn';
import { ClientProblemError } from '../client/problemDetails';
import { SNACKBAR_EVENT, type SnackbarEventDetail } from '../client/snackbar';
import dailyVibe from '../i18n/locales/dailyVibe';
import wirCheckIn from '../i18n/locales/wirCheckIn';
import { useWirDailyCheckIn } from './WirDailyCheckIn';

type VibePartner =
  | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
  | { state: 'NO_CHECK_IN' }
  | { state: 'VISIBLE'; value: DailyVibe };
type EnergyPartner =
  | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
  | { state: 'NO_CHECK_IN' }
  | { state: 'VISIBLE'; value: number };

const HIDDEN = { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' } as const;
const SEEN_NOTE_KEY = 'eimir.wir.partnerNoteSeen:account-1:space-1';

let snackbars: SnackbarEventDetail[] = [];
function recordSnackbar(event: Event) {
  snackbars.push((event as CustomEvent<SnackbarEventDetail>).detail);
}

beforeEach(() => {
  snackbars = [];
  window.addEventListener(SNACKBAR_EVENT, recordSnackbar);
});

afterEach(() => {
  cleanup();
  window.removeEventListener(SNACKBAR_EVENT, recordSnackbar);
  window.localStorage.clear();
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  // The offline event also flips React Query's own online manager.
  onlineManager.setOnline(true);
});

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

function energyPart(value: number) {
  return fill(wirCheckIn.summaryEnergy, { value });
}

function ownLabel(parts: string[]) {
  return fill(wirCheckIn.ownAria, {
    summary: parts.join(wirCheckIn.summarySeparator),
  });
}

function projection({
  ownVibe = null,
  ownNote = null,
  ownEnergy = null,
  partnerVibe = HIDDEN,
  partnerNote = null,
  partnerEnergy = HIDDEN,
  vibeModule = true,
  energyModule = true,
}: {
  ownVibe?: DailyVibe | null;
  ownNote?: string | null;
  ownEnergy?: number | null;
  partnerVibe?: VibePartner;
  partnerNote?: string | null;
  partnerEnergy?: EnergyPartner;
  vibeModule?: boolean;
  energyModule?: boolean;
} = {}): DailyCheckInTodayView {
  return {
    checkedOn: new Date('2026-09-21T00:00:00.000Z'),
    dailyContextTimezone: 'Europe/Berlin',
    own: {
      energyLevel: ownEnergy,
      vibe: ownVibe,
      vibeNote: ownNote,
      version: ownVibe === null && ownEnergy === null ? 0 : 1,
    },
    energy: energyModule
      ? { visibilityMode: 'MUTUAL_REVEAL', partner: partnerEnergy }
      : null,
    vibe: vibeModule
      ? {
          visibilityMode: 'MUTUAL_REVEAL',
          partner: partnerVibe,
          partnerNote,
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

function deferredResponse() {
  let resolve!: (value: ReturnType<typeof rawResponse>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ReturnType<typeof rawResponse>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type HarnessProps = {
  api: DailyCheckInsApi;
  accountId?: string;
  spaceId?: string;
  vibeEnabled?: boolean;
  energyEnabled?: boolean;
};

/** Renders the hook output the way TodayPage wires it to the avatar pair. */
function Harness({
  api,
  accountId = 'account-1',
  spaceId = 'space-1',
  vibeEnabled = true,
  energyEnabled = true,
}: HarnessProps) {
  const checkIn = useWirDailyCheckIn({
    api,
    accountId,
    spaceId,
    partnerName: 'Ben',
    vibeEnabled,
    energyEnabled,
  });
  const [partnerOpen, setPartnerOpen] = useState(false);
  if (!checkIn) return <p data-testid="wir-checkin-inactive" />;
  return (
    <div>
      <button
        type="button"
        data-testid="own-trigger"
        aria-label={checkIn.ownAction.label}
        aria-expanded={checkIn.ownAction.expanded}
        aria-controls={checkIn.ownAction.controls}
        ref={checkIn.ownAction.ref}
        onClick={checkIn.ownAction.onActivate}
      />
      {checkIn.ownBadge}
      <button
        type="button"
        data-testid="partner-trigger"
        data-partner-state={checkIn.partnerState}
        aria-label={checkIn.partnerAriaLabel ?? 'partner'}
        onClick={() => setPartnerOpen(true)}
      />
      {checkIn.partnerBadge}
      {checkIn.panel}
      {partnerOpen ? checkIn.partnerBlock : null}
      <div data-testid="announcement">{checkIn.announcement}</div>
    </div>
  );
}

function renderCheckIn(props: HarnessProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

function apiFor(
  initial: DailyCheckInTodayView,
  {
    etag = '"today:1"',
    update = vi.fn(),
  }: { etag?: string; update?: ReturnType<typeof vi.fn> } = {},
) {
  const get = vi.fn().mockResolvedValue(rawResponse(initial, etag));
  const api = {
    getDailyCheckInTodayRaw: get,
    updateDailyCheckInTodayRaw: update,
  } as unknown as DailyCheckInsApi;
  return { api, get, update };
}

async function loaded() {
  await screen.findByTestId('wir-checkin-own-badge');
}

async function openPanel() {
  await loaded();
  const trigger = screen.getByTestId('own-trigger');
  if (trigger.getAttribute('aria-expanded') !== 'true')
    fireEvent.click(trigger);
  return screen.getByTestId('wir-checkin-panel');
}

function vibeButton(value: DailyVibe) {
  return screen.getByRole('button', { name: dailyVibe.values[value] });
}

function slider() {
  return screen.getByRole('slider', {
    name: wirCheckIn.energySliderLabel,
  }) as HTMLInputElement;
}

function noteField() {
  return screen.getByRole('textbox', {
    name: wirCheckIn.noteLabel,
  }) as HTMLTextAreaElement;
}

function payloads(update: ReturnType<typeof vi.fn>) {
  return update.mock.calls.map((call) => call[0].dailyCheckInUpdate);
}

describe('WirDailyCheckIn badges and accessible names', () => {
  it('stays inactive without querying when both modules are configured off', () => {
    const { api, get } = apiFor(projection());
    renderCheckIn({ api, vibeEnabled: false, energyEnabled: false });
    expect(screen.getByTestId('wir-checkin-inactive')).not.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('labels the own avatar as pending and shows no badge before the read loads', () => {
    const api = {
      getDailyCheckInTodayRaw: vi.fn(() => new Promise(() => undefined)),
    } as unknown as DailyCheckInsApi;
    renderCheckIn({ api });
    expect(screen.getByTestId('own-trigger').getAttribute('aria-label')).toBe(
      wirCheckIn.ownAriaPending,
    );
    expect(screen.queryByTestId('wir-checkin-own-badge')).toBeNull();
    expect(screen.queryByTestId('wir-checkin-partner-badge')).toBeNull();
  });

  it('invites the first check-in and locks the hidden partner values', async () => {
    const { api } = apiFor(projection({ partnerNote: 'Must stay hidden' }));
    renderCheckIn({ api });
    const own = await screen.findByTestId('wir-checkin-own-badge');
    expect(own.textContent?.trim()).toBe(wirCheckIn.ownPrompt);
    expect(own.querySelector('.eimir-icon-hinzufuegen')).toBeTruthy();
    expect(own.querySelector('[data-vibe-icon]')).toBeNull();
    expect(own.querySelector('.daily-energy-battery-icon')).toBeNull();
    expect(screen.getByTestId('own-trigger').getAttribute('aria-label')).toBe(
      wirCheckIn.ownAriaEmpty,
    );

    const partner = screen.getByTestId('wir-checkin-partner-badge');
    expect(partner.getAttribute('data-state')).toBe('hidden');
    expect(partner.querySelector('.wir-checkin-lock')).not.toBeNull();
    expect(partner.querySelector('[data-vibe-icon]')).toBeNull();
    expect(partner.querySelector('.daily-energy-battery-icon')).toBeNull();
    expect(
      screen.getByTestId('partner-trigger').getAttribute('aria-label'),
    ).toBe(fill(wirCheckIn.partnerHiddenAria, { name: 'Ben' }));
    expect(screen.queryByTestId('wir-checkin-note-dot')).toBeNull();

    fireEvent.click(screen.getByTestId('partner-trigger'));
    const block = screen.getByTestId('wir-checkin-partner-block');
    expect(block.textContent).toBe(wirCheckIn.partnerHidden);
    expect(screen.queryByText('Must stay hidden')).toBeNull();
  });

  it('shows the own and partner glyph and battery without any visible number', async () => {
    const { api } = apiFor(
      projection({
        ownVibe: 'GOOD',
        ownEnergy: 60,
        partnerVibe: { state: 'VISIBLE', value: 'STRESSED' },
        partnerEnergy: { state: 'VISIBLE', value: 40 },
      }),
    );
    renderCheckIn({ api });
    const own = await screen.findByTestId('wir-checkin-own-badge');
    expect(own.querySelector('[data-vibe-icon="GOOD"]')).not.toBeNull();
    expect(
      own
        .querySelector('.daily-energy-battery-icon')
        ?.getAttribute('data-level'),
    ).toBe('medium');
    expect(own.textContent).not.toMatch(/\d/);
    expect(screen.getByTestId('own-trigger').getAttribute('aria-label')).toBe(
      ownLabel([dailyVibe.values.GOOD, energyPart(60)]),
    );

    const partner = screen.getByTestId('wir-checkin-partner-badge');
    expect(partner.getAttribute('data-state')).toBe('visible');
    expect(partner.querySelector('[data-vibe-icon="STRESSED"]')).not.toBeNull();
    expect(
      partner
        .querySelector('.daily-energy-battery-icon')
        ?.getAttribute('data-level'),
    ).toBe('medium');
    expect(partner.textContent).not.toMatch(/\d/);
    expect(
      screen.getByTestId('partner-trigger').getAttribute('aria-label'),
    ).toBe(
      fill(wirCheckIn.partnerAria, {
        name: 'Ben',
        summary: [dailyVibe.values.STRESSED, energyPart(40)].join(
          wirCheckIn.summarySeparator,
        ),
      }),
    );
  });

  it('mentions an own note in the own accessible name', async () => {
    const { api } = apiFor(
      projection({ ownVibe: 'GOOD', ownEnergy: 60, ownNote: 'Long week' }),
    );
    renderCheckIn({ api });
    await loaded();
    expect(screen.getByTestId('own-trigger').getAttribute('aria-label')).toBe(
      ownLabel([dailyVibe.values.GOOD, energyPart(60), wirCheckIn.summaryNote]),
    );
  });

  it('renders no partner badge or block content for NO_CHECK_IN', async () => {
    const { api } = apiFor(
      projection({
        ownEnergy: 60,
        partnerVibe: { state: 'NO_CHECK_IN' },
        partnerEnergy: { state: 'NO_CHECK_IN' },
      }),
    );
    renderCheckIn({ api });
    await loaded();
    expect(screen.queryByTestId('wir-checkin-partner-badge')).toBeNull();
    expect(
      screen.getByTestId('partner-trigger').getAttribute('aria-label'),
    ).toBe(fill(wirCheckIn.partnerNoneAria, { name: 'Ben' }));
    fireEvent.click(screen.getByTestId('partner-trigger'));
    expect(screen.getByTestId('wir-checkin-partner-block').textContent).toBe(
      fill(wirCheckIn.partnerNone, { name: 'Ben' }),
    );
  });
});

describe('WirDailyCheckIn panel', () => {
  it('opens inline, closes with Done or Escape and returns focus to the own avatar', async () => {
    const { api } = apiFor(projection({ ownEnergy: 60 }));
    renderCheckIn({ api });
    const panel = await openPanel();
    const trigger = screen.getByTestId('own-trigger');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(
      within(panel).getByRole('heading', { name: wirCheckIn.panelTitle }),
    ).not.toBeNull();

    fireEvent.keyDown(slider(), { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: wirCheckIn.done }));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('offers five feelings and keeps an existing need value selectable', async () => {
    const { api } = apiFor(projection());
    const first = renderCheckIn({ api });
    const panel = await openPanel();
    expect(panel.querySelectorAll('[data-vibe]')).toHaveLength(5);
    expect(within(panel).queryByText(dailyVibe.values.NEEDS_SPACE)).toBeNull();
    first.unmount();

    const preserved = apiFor(projection({ ownVibe: 'NEEDS_CONNECTION' }));
    renderCheckIn({ api: preserved.api });
    const second = await openPanel();
    expect(second.querySelectorAll('[data-vibe]')).toHaveLength(6);
    expect(vibeButton('NEEDS_CONNECTION').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('explains removal with and without a note and requires a feeling for the note', async () => {
    const empty = apiFor(projection());
    const first = renderCheckIn({ api: empty.api });
    await openPanel();
    expect(noteField().disabled).toBe(true);
    expect(noteField().maxLength).toBe(200);
    expect(screen.getByText(wirCheckIn.noteRequiresVibe)).not.toBeNull();
    expect(screen.queryByText(wirCheckIn.vibeSelectedHint)).toBeNull();
    first.unmount();

    const withoutNote = apiFor(projection({ ownVibe: 'GOOD' }));
    const second = renderCheckIn({ api: withoutNote.api });
    await openPanel();
    expect(noteField().disabled).toBe(false);
    expect(screen.getByText(wirCheckIn.vibeSelectedHint)).not.toBeNull();
    expect(
      screen.getByText(fill(wirCheckIn.noteCount, { count: 0 })),
    ).not.toBeNull();
    second.unmount();

    const withNote = apiFor(projection({ ownVibe: 'GOOD', ownNote: 'Hi' }));
    renderCheckIn({ api: withNote.api });
    await openPanel();
    expect(
      screen.getByText(wirCheckIn.vibeSelectedHintWithNote),
    ).not.toBeNull();
    expect(noteField().value).toBe('Hi');
  });

  it('saves a tapped feeling alone with the current validator', async () => {
    const update = vi
      .fn()
      .mockResolvedValue(
        rawResponse(
          projection({ ownVibe: 'GOOD', ownEnergy: 60 }),
          '"today:2"',
        ),
      );
    const { api } = apiFor(projection({ ownEnergy: 60 }), { update });
    renderCheckIn({ api });
    await openPanel();
    fireEvent.click(vibeButton('GOOD'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      spaceId: 'space-1',
      ifMatch: '"today:1"',
      dailyCheckInUpdate: { vibe: 'GOOD' },
    });
    await waitFor(() =>
      expect(vibeButton('GOOD').getAttribute('aria-pressed')).toBe('true'),
    );
  });

  it('removes the selected feeling when it is tapped again', async () => {
    const update = vi
      .fn()
      .mockResolvedValue(rawResponse(projection(), '"today:2"'));
    const { api } = apiFor(projection({ ownVibe: 'GOOD', ownNote: 'Hi' }), {
      update,
    });
    renderCheckIn({ api });
    await openPanel();
    fireEvent.click(vibeButton('GOOD'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(payloads(update)).toEqual([{ vibe: null }]);
    await waitFor(() => expect(noteField().disabled).toBe(true));
    expect(noteField().value).toBe('');
  });

  it('does not save the neutral slider position when only opened and left', async () => {
    const { api, update } = apiFor(projection());
    renderCheckIn({ api });
    await openPanel();
    expect(slider().value).toBe('50');
    expect(slider().min).toBe('10');
    expect(slider().max).toBe('100');
    expect(slider().step).toBe('10');
    expect(slider().getAttribute('aria-valuetext')).toBe(
      wirCheckIn.energyNotSet,
    );
    fireEvent.blur(slider());
    fireEvent.pointerUp(slider());
    expect(update).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: wirCheckIn.energyRemoveAria }),
    ).toBeNull();
  });

  it('saves Energy on release and removes it separately', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce(
        rawResponse(projection({ ownEnergy: 70 }), '"today:2"'),
      )
      .mockResolvedValueOnce(rawResponse(projection(), '"today:3"'));
    const { api } = apiFor(projection(), { update });
    renderCheckIn({ api });
    await openPanel();
    fireEvent.change(slider(), { target: { value: '70' } });
    expect(update).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toEqual({
      spaceId: 'space-1',
      ifMatch: '"today:1"',
      dailyCheckInUpdate: { energyLevel: 70 },
    });
    await waitFor(() =>
      expect(screen.getByTestId('own-trigger').getAttribute('aria-label')).toBe(
        ownLabel([energyPart(70)]),
      ),
    );
    expect(screen.getByTestId('wir-checkin-panel').textContent).not.toMatch(
      /\d+\s*%/,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: wirCheckIn.energyRemoveAria }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0]).toEqual({
      spaceId: 'space-1',
      ifMatch: '"today:2"',
      dailyCheckInUpdate: { energyLevel: null },
    });
    await waitFor(() =>
      expect(screen.getByTestId('own-trigger').getAttribute('aria-label')).toBe(
        wirCheckIn.ownAriaEmpty,
      ),
    );
  });

  it('saves a trimmed note on blur and skips unchanged notes', async () => {
    const update = vi
      .fn()
      .mockResolvedValue(
        rawResponse(
          projection({ ownVibe: 'GOOD', ownNote: 'Long week' }),
          '"today:2"',
        ),
      );
    const { api } = apiFor(projection({ ownVibe: 'GOOD' }), { update });
    renderCheckIn({ api });
    await openPanel();
    fireEvent.change(noteField(), { target: { value: '   ' } });
    fireEvent.blur(noteField());
    expect(update).not.toHaveBeenCalled();

    fireEvent.change(noteField(), { target: { value: '  Long week  ' } });
    fireEvent.blur(noteField());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(payloads(update)).toEqual([{ vibeNote: 'Long week' }]);
    await waitFor(() => expect(noteField().value).toBe('Long week'));
    fireEvent.blur(noteField());
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('deletes the note alone and offers an undo that restores it', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce(
        rawResponse(projection({ ownVibe: 'GOOD' }), '"today:2"'),
      )
      .mockResolvedValueOnce(
        rawResponse(
          projection({ ownVibe: 'GOOD', ownNote: 'Long week' }),
          '"today:3"',
        ),
      );
    const { api } = apiFor(
      projection({ ownVibe: 'GOOD', ownNote: 'Long week' }),
      {
        update,
      },
    );
    renderCheckIn({ api });
    await openPanel();
    fireEvent.click(
      screen.getByRole('button', { name: wirCheckIn.noteDelete }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(payloads(update)).toEqual([{ vibeNote: null }]);
    expect(snackbars).toHaveLength(1);
    expect(snackbars[0].messageKey).toBe('wirCheckIn.noteDeleted');
    expect(snackbars[0].action?.labelKey).toBe('wirCheckIn.undo');
    await waitFor(() => expect(noteField().value).toBe(''));
    expect(
      screen.queryByRole('button', { name: wirCheckIn.noteDelete }),
    ).toBeNull();

    act(() => snackbars[0].action?.run());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0]).toEqual({
      spaceId: 'space-1',
      ifMatch: '"today:2"',
      dailyCheckInUpdate: { vibeNote: 'Long week' },
    });
    await waitFor(() => expect(noteField().value).toBe('Long week'));
  });

  it('queues a value chosen while another write is in flight and sends it afterwards', async () => {
    const held = deferredResponse();
    const update = vi
      .fn()
      .mockReturnValueOnce(held.promise)
      .mockResolvedValueOnce(
        rawResponse(
          projection({ ownVibe: 'GOOD', ownEnergy: 80 }),
          '"today:3"',
        ),
      );
    const { api } = apiFor(projection(), { update });
    renderCheckIn({ api });
    await openPanel();
    fireEvent.click(vibeButton('GOOD'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    fireEvent.change(slider(), { target: { value: '80' } });
    fireEvent.pointerUp(slider());
    await waitFor(() =>
      expect(screen.getByText(wirCheckIn.saving)).not.toBeNull(),
    );
    expect(
      screen.getByTestId('wir-checkin-own-badge').getAttribute('data-pending'),
    ).toBe('true');
    expect(screen.getByTestId('own-trigger').getAttribute('aria-label')).toBe(
      ownLabel([dailyVibe.values.GOOD, energyPart(80)]),
    );
    expect(update).toHaveBeenCalledTimes(1);

    held.resolve(rawResponse(projection({ ownVibe: 'GOOD' }), '"today:2"'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0]).toEqual({
      spaceId: 'space-1',
      ifMatch: '"today:2"',
      dailyCheckInUpdate: { energyLevel: 80 },
    });
    await waitFor(() =>
      expect(
        screen
          .getByTestId('wir-checkin-own-badge')
          .getAttribute('data-pending'),
      ).toBeNull(),
    );
  });

  it('opens the panel with an inline retry after a generic write error', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new ClientProblemError('server', 500, 'BROKEN'))
      .mockResolvedValueOnce(
        rawResponse(projection({ ownVibe: 'SAD' }), '"today:2"'),
      );
    const { api } = apiFor(projection(), { update });
    renderCheckIn({ api });
    await openPanel();
    fireEvent.click(vibeButton('SAD'));
    fireEvent.click(screen.getByRole('button', { name: wirCheckIn.done }));
    const retry = await screen.findByRole('button', { name: wirCheckIn.retry });
    expect(
      screen.getByTestId('own-trigger').getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByText(wirCheckIn.saveError)).not.toBeNull();
    expect(vibeButton('SAD').getAttribute('aria-pressed')).toBe('false');
    expect(update).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(payloads(update)).toEqual([{ vibe: 'SAD' }, { vibe: 'SAD' }]);
    await waitFor(() =>
      expect(screen.queryByText(wirCheckIn.saveError)).toBeNull(),
    );
  });
});

describe('WirDailyCheckIn partner block', () => {
  it('shows the revealed feeling, battery, time and note', async () => {
    const { api } = apiFor(
      projection({
        ownVibe: 'OKAY',
        partnerVibe: { state: 'VISIBLE', value: 'GOOD' },
        partnerEnergy: { state: 'VISIBLE', value: 80 },
        partnerNote: '  A quiet evening would help.  ',
      }),
    );
    renderCheckIn({ api });
    await loaded();
    expect(screen.queryByText('A quiet evening would help.')).toBeNull();
    fireEvent.click(screen.getByTestId('partner-trigger'));
    const block = screen.getByTestId('wir-checkin-partner-block');
    expect(block.querySelector('[data-vibe-icon="GOOD"]')).not.toBeNull();
    expect(within(block).getByText(dailyVibe.values.GOOD)).not.toBeNull();
    expect(
      within(block).getByRole('img', {
        name: fill(wirCheckIn.partnerEnergyAria, { value: 80 }),
      }),
    ).not.toBeNull();
    expect(within(block).getByText(wirCheckIn.partnerToday)).not.toBeNull();
    expect(within(block).getByText('A quiet evening would help.').tagName).toBe(
      'BLOCKQUOTE',
    );
  });

  it('shows no note when only Energy is visible', async () => {
    const { api } = apiFor(
      projection({
        ownEnergy: 60,
        partnerVibe: HIDDEN,
        partnerEnergy: { state: 'VISIBLE', value: 30 },
        partnerNote: 'Must stay hidden',
      }),
    );
    renderCheckIn({ api });
    await loaded();
    fireEvent.click(screen.getByTestId('partner-trigger'));
    const block = screen.getByTestId('wir-checkin-partner-block');
    expect(block.querySelector('[data-vibe-icon]')).toBeNull();
    expect(within(block).queryByText('Must stay hidden')).toBeNull();
    expect(screen.queryByTestId('wir-checkin-note-dot')).toBeNull();
  });

  it('clears the unread note dot locally when the block renders, without a network write', async () => {
    const note = 'A quiet evening would help.';
    const { api, update } = apiFor(
      projection({
        ownVibe: 'OKAY',
        partnerVibe: { state: 'VISIBLE', value: 'GOOD' },
        partnerNote: note,
      }),
    );
    const first = renderCheckIn({ api });
    await screen.findByTestId('wir-checkin-note-dot');
    const partnerTrigger = screen.getByTestId('partner-trigger');
    expect(partnerTrigger.getAttribute('aria-label')).toBe(
      fill(wirCheckIn.partnerAria, {
        name: 'Ben',
        summary: [dailyVibe.values.GOOD, wirCheckIn.summaryNewNote].join(
          wirCheckIn.summarySeparator,
        ),
      }),
    );

    fireEvent.click(partnerTrigger);
    await waitFor(() =>
      expect(screen.queryByTestId('wir-checkin-note-dot')).toBeNull(),
    );
    expect(partnerTrigger.getAttribute('aria-label')).toBe(
      fill(wirCheckIn.partnerAria, {
        name: 'Ben',
        summary: [dailyVibe.values.GOOD, wirCheckIn.summaryNote].join(
          wirCheckIn.summarySeparator,
        ),
      }),
    );
    const stored = window.localStorage.getItem(SEEN_NOTE_KEY);
    expect(stored).toMatch(/^2026-09-21:Europe\/Berlin:/);
    expect(stored).not.toContain('quiet');
    expect(update).not.toHaveBeenCalled();
    first.unmount();

    renderCheckIn({ api });
    await screen.findByTestId('wir-checkin-partner-badge');
    expect(screen.queryByTestId('wir-checkin-note-dot')).toBeNull();
  });

  it('announces the partner reveal after the own check-in', async () => {
    const update = vi.fn().mockResolvedValue(
      rawResponse(
        projection({
          ownVibe: 'GOOD',
          partnerVibe: { state: 'VISIBLE', value: 'SAD' },
        }),
        '"today:2"',
      ),
    );
    const { api } = apiFor(projection(), { update });
    renderCheckIn({ api });
    await openPanel();
    expect(screen.getByTestId('announcement').textContent).toBe('');
    fireEvent.click(vibeButton('GOOD'));
    await waitFor(() =>
      expect(screen.getByTestId('announcement').textContent).toBe(
        fill(wirCheckIn.revealed, {
          summary: `Ben: ${dailyVibe.values.SAD}`,
        }),
      ),
    );
    const partner = screen.getByTestId('wir-checkin-partner-badge');
    expect(partner.getAttribute('data-state')).toBe('visible');
    expect(partner.querySelector('.is-revealed')).not.toBeNull();
    expect(
      within(screen.getByTestId('announcement')).getByRole('status'),
    ).not.toBeNull();
  });
});

describe('WirDailyCheckIn availability', () => {
  it('disables every control offline and never patches', async () => {
    const { api, update } = apiFor(
      projection({ ownVibe: 'GOOD', ownEnergy: 60 }),
    );
    renderCheckIn({ api });
    await openPanel();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByText(wirCheckIn.offline)).not.toBeNull();
    expect(
      (vibeButton('SAD').closest('fieldset') as HTMLFieldSetElement).disabled,
    ).toBe(true);
    expect(slider().disabled).toBe(true);
    expect(noteField().disabled).toBe(true);
    // Offline is not authoritative: no own or partner value is presented, so
    // there is nothing to remove either.
    expect(
      screen.queryByRole('button', { name: wirCheckIn.energyRemoveAria }),
    ).toBeNull();
    expect(screen.queryByTestId('wir-checkin-partner-badge')).toBeNull();
    fireEvent.click(vibeButton('SAD'));
    fireEvent.change(slider(), { target: { value: '90' } });
    fireEvent.pointerUp(slider());
    expect(update).not.toHaveBeenCalled();
  });

  it('hides the feeling controls when the server reports Vibe disabled but lets the own value be removed', async () => {
    const update = vi
      .fn()
      .mockResolvedValue(
        rawResponse(
          projection({ ownEnergy: 60, vibeModule: false }),
          '"today:2"',
        ),
      );
    const { api } = apiFor(
      projection({
        ownVibe: 'GOOD',
        ownEnergy: 60,
        vibeModule: false,
        partnerEnergy: { state: 'VISIBLE', value: 40 },
      }),
      { update },
    );
    renderCheckIn({ api });
    await openPanel();
    expect(screen.queryAllByRole('button', { pressed: false })).toHaveLength(0);
    expect(document.querySelector('[data-vibe]')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(slider()).not.toBeNull();
    expect(screen.getByText(wirCheckIn.vibeDisabled)).not.toBeNull();
    expect(
      screen
        .getByTestId('wir-checkin-partner-badge')
        .querySelector('[data-vibe-icon]'),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: wirCheckIn.vibeDisabledRemove }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(payloads(update)).toEqual([{ vibe: null }]);
  });

  it('hides the slider when the server reports Energy disabled but lets the own value be removed', async () => {
    const update = vi
      .fn()
      .mockResolvedValue(
        rawResponse(
          projection({ ownVibe: 'GOOD', energyModule: false }),
          '"today:2"',
        ),
      );
    const { api } = apiFor(
      projection({ ownVibe: 'GOOD', ownEnergy: 60, energyModule: false }),
      { update },
    );
    renderCheckIn({ api });
    await openPanel();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(vibeButton('GOOD')).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: wirCheckIn.energyRemoveAria }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(payloads(update)).toEqual([{ energyLevel: null }]);
  });

  it('ignores a disabled dimension configured off on the client', async () => {
    const { api } = apiFor(
      projection({
        ownVibe: 'GOOD',
        ownEnergy: 60,
        partnerVibe: { state: 'VISIBLE', value: 'SAD' },
        partnerEnergy: { state: 'VISIBLE', value: 40 },
      }),
    );
    renderCheckIn({ api, energyEnabled: false });
    await openPanel();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(
      screen
        .getByTestId('wir-checkin-partner-badge')
        .querySelector('.daily-energy-battery-icon'),
    ).toBeNull();
  });

  for (const dimension of ['vibe', 'energy'] as const) {
    const label = dimension === 'vibe' ? 'Vibe' : 'Energy';

    it(`posts the ${dimension} conflict snackbar and adopts the refetched state without retrying`, async () => {
      const update = vi
        .fn()
        .mockRejectedValue(
          new ClientProblemError('conflict', 409, 'RESOURCE_VERSION_CONFLICT'),
        );
      const { api, get } = apiFor(
        projection({ ownVibe: 'GOOD', ownEnergy: 60 }),
        {
          update,
        },
      );
      get
        .mockResolvedValueOnce(
          rawResponse(
            projection({ ownVibe: 'GOOD', ownEnergy: 60 }),
            '"today:1"',
          ),
        )
        .mockResolvedValue(
          rawResponse(
            projection({ ownVibe: 'SAD', ownEnergy: 90 }),
            '"today:2"',
          ),
        );
      renderCheckIn({ api });
      await openPanel();
      if (dimension === 'vibe') fireEvent.click(vibeButton('STRESSED'));
      else {
        fireEvent.change(slider(), { target: { value: '70' } });
        fireEvent.pointerUp(slider());
      }
      await waitFor(() =>
        expect(snackbars.map((entry) => entry.messageKey)).toEqual([
          `snackbar.daily${label}Conflict`,
        ]),
      );
      expect(get).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(
          screen.getByTestId('own-trigger').getAttribute('aria-label'),
        ).toBe(ownLabel([dailyVibe.values.SAD, energyPart(90)])),
      );
      expect(screen.queryByText(wirCheckIn.saveError)).toBeNull();
    });

    it(`posts the ${dimension} module-disabled snackbar and drops the disabled controls`, async () => {
      const update = vi
        .fn()
        .mockRejectedValue(
          new ClientProblemError('permission', 403, 'SPACE_MODULE_DISABLED'),
        );
      const { api, get } = apiFor(projection(), { update });
      get
        .mockResolvedValueOnce(rawResponse(projection(), '"today:1"'))
        .mockResolvedValue(
          rawResponse(
            projection(
              dimension === 'vibe'
                ? { vibeModule: false }
                : { energyModule: false },
            ),
            '"today:1"',
          ),
        );
      renderCheckIn({ api });
      await openPanel();
      if (dimension === 'vibe') fireEvent.click(vibeButton('GOOD'));
      else {
        fireEvent.change(slider(), { target: { value: '70' } });
        fireEvent.pointerUp(slider());
      }
      await waitFor(() =>
        expect(snackbars.map((entry) => entry.messageKey)).toEqual([
          `snackbar.daily${label}ModuleDisabled`,
        ]),
      );
      await waitFor(() =>
        dimension === 'vibe'
          ? expect(document.querySelector('[data-vibe]')).toBeNull()
          : expect(screen.queryByRole('slider')).toBeNull(),
      );
      expect(update).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(wirCheckIn.saveError)).toBeNull();
    });
  }

  it('keeps the cached own state untouched while a write is pending', async () => {
    const held = deferredResponse();
    const update = vi.fn().mockReturnValue(held.promise);
    const { api } = apiFor(projection({ ownEnergy: 60 }), { update });
    const { queryClient } = renderCheckIn({ api });
    await openPanel();
    fireEvent.click(vibeButton('OKAY'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const cached = queryClient.getQueryData<{
      etag: string;
      projection: DailyCheckInTodayView;
    }>(dailyCheckInTodayQueryKey('account-1', 'space-1'));
    expect(cached?.etag).toBe('"today:1"');
    expect(cached?.projection.own.vibe).toBeNull();
    expect(
      screen
        .getByTestId('wir-checkin-partner-badge')
        .getAttribute('data-state'),
    ).toBe('hidden');
    held.resolve(
      rawResponse(projection({ ownVibe: 'OKAY', ownEnergy: 60 }), '"today:2"'),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
