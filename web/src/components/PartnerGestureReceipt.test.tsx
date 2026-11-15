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
import type { ReactElement } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import { NotificationKind } from '../api/generated/models/NotificationKind';
import { SupportGestureKind } from '../api/generated/models/SupportGestureKind';
import { dashboardQueryKey } from '../client/dashboardQueries';
import {
  OPEN_OWN_DAILY_CHECK_IN_STATE,
  receiptScope,
  requestPartnerGestureReceipt,
} from '../client/partnerGestureReceipt';
import { ClientProblemError } from '../client/problemDetails';
import { proPaywallPath } from '../client/routes';
import { spaceConfigurationQueryKey } from '../client/spaceConfiguration';
import { spaceEntitlementQueryKey } from '../client/spaceEntitlement';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import {
  PARTNER_GESTURE_RECEIPT_VISIBLE_MS,
  PartnerGestureReceiptHost,
} from './PartnerGestureReceipt';

const notifications = {
  getNotifications: vi.fn(),
  sendThinkingOfYou: vi.fn(),
  sendPartnerQuickAction: vi.fn(),
};

vi.mock('../client/m4Product', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client/m4Product')>()),
  createM4ProductApis: () => ({ notifications }),
}));

const copy = relationshipComponents.partnerGestureReceipt;
const quick = relationshipComponents.partnerQuickActions;
const titleFor = (key: 'thinking' | 'kiss' | 'checkIn') =>
  copy[key].title.replace('{{name}}', 'Ronja');
const ACCOUNT = 'account-me';
const PARTNER = 'account-ronja';
const SPACE = 'space-1';

let clock = Date.parse('2026-11-15T10:00:00Z');

function gesture(
  id: string,
  kind: NotificationKind,
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  return {
    id,
    kind,
    actorId: PARTNER,
    // No profile attachment: the shared initials fallback is used.
    actor: { id: PARTNER, displayName: 'Ronja' },
    createdAt: new Date(clock + 1_000),
    readAt: null,
    sourceEventId: `event-${id}`,
    targetId: null,
    targetType: null,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {`${location.pathname}|${JSON.stringify(location.state)}`}
    </div>
  );
}

function setup({
  configuration = {
    supportGesturesEnabled: true,
    vibeCheckEnabled: false,
    energyCheckInEnabled: false,
  },
  capabilities,
  unreadCount = 0,
  accountId = ACCOUNT,
}: {
  configuration?: Record<string, boolean>;
  capabilities?: string[];
  unreadCount?: number;
  accountId?: string;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(spaceConfigurationQueryKey(accountId, SPACE), {
    configuration,
    etag: '"1"',
  });
  if (capabilities)
    client.setQueryData(spaceEntitlementQueryKey(accountId, SPACE), {
      capabilities,
      spaceId: SPACE,
    });
  const element = (count: number, owner = accountId, extra?: ReactElement) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/story']}>
        {extra}
        <PartnerGestureReceiptHost
          key={`${owner}:${SPACE}`}
          apiBaseUrl="https://eimir.test"
          accessToken="token"
          accountId={owner}
          spaceId={SPACE}
          unreadCount={count}
          suppressed={false}
        />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(element(unreadCount));
  return {
    client,
    rerender: (count: number, owner = accountId, extra?: ReactElement) =>
      view.rerender(element(count, owner, extra)),
  };
}

function page(...items: NotificationItem[]) {
  return { items, nextCursor: null };
}

const receipt = () => screen.queryAllByTestId('partner-gesture-receipt');

/** jsdom runs no CSS animation: complete the retained exit explicitly. */
function finishExit() {
  for (const surface of receipt())
    if (surface.getAttribute('data-presence') === 'exiting') {
      fireEvent.animationEnd(surface);
      // React maps the event to its vendor-prefixed name in jsdom.
      if (surface.isConnected)
        fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }));
    }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: clock });
  clock = Date.now();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  notifications.getNotifications.mockReset();
  notifications.sendThinkingOfYou.mockReset();
  notifications.sendPartnerQuickAction.mockReset();
  onlineManager.setOnline(true);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PartnerGestureReceiptHost', () => {
  it('does not read or replay anything at app start', async () => {
    setup({ unreadCount: 3 });
    await act(async () => undefined);
    expect(notifications.getNotifications).not.toHaveBeenCalled();
    expect(receipt()).toHaveLength(0);
  });

  it.each([
    [
      NotificationKind.THINKING_OF_YOU,
      'heart-pulse',
      titleFor('thinking'),
      copy.thinking.detail,
    ],
    [NotificationKind.PARTNER_KISS, 'kiss', titleFor('kiss'), copy.kiss.detail],
    [
      NotificationKind.PARTNER_CHECK_IN,
      'calm-ring',
      titleFor('checkIn'),
      copy.checkIn.detail,
    ],
  ])(
    'presents a new %s once with its own motion variant',
    async (kind, motion, title, detail) => {
      notifications.getNotifications.mockResolvedValue(
        page(gesture('g1', kind)),
      );
      const { rerender } = setup();
      rerender(1);
      const surface = await screen.findByTestId('partner-gesture-receipt');
      expect(notifications.getNotifications).toHaveBeenCalledWith({
        spaceId: SPACE,
        limit: 5,
      });
      expect(surface.getAttribute('data-variant')).toBe(motion);
      expect(screen.getByRole('complementary', { name: title })).toBe(surface);
      expect(surface.textContent).toContain(detail);
      // Announced once by the persistent polite region, not by the surface.
      expect(screen.getByRole('status').textContent).toContain(
        `${title}. ${detail}`,
      );
      expect(surface.hasAttribute('aria-live')).toBe(false);
      // The avatar is decorative here; its initials fallback renders.
      expect(surface.textContent).toContain('RO');

      // The same ID never animates again after a later count change.
      fireEvent.click(screen.getByRole('button', { name: copy.close }));
      finishExit();
      rerender(2);
      await waitFor(() =>
        expect(notifications.getNotifications).toHaveBeenCalledTimes(2),
      );
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(receipt()).toHaveLength(0);
    },
  );

  it('keeps unread history and own gestures in the Center only', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(
        gesture('history', NotificationKind.THINKING_OF_YOU, {
          createdAt: new Date(clock - 60_000),
        }),
        gesture('own', NotificationKind.PARTNER_KISS, { actorId: ACCOUNT }),
      ),
    );
    const { rerender } = setup();
    rerender(1);
    await waitFor(() =>
      expect(notifications.getNotifications).toHaveBeenCalledTimes(1),
    );
    await act(async () => undefined);
    expect(receipt()).toHaveLength(0);
  });

  it('never stacks: a newer gesture replaces the current one', async () => {
    notifications.getNotifications
      .mockResolvedValueOnce(
        page(gesture('a', NotificationKind.THINKING_OF_YOU)),
      )
      .mockResolvedValueOnce(
        page(
          gesture('b', NotificationKind.PARTNER_KISS, {
            createdAt: new Date(clock + 5_000),
          }),
          gesture('a', NotificationKind.THINKING_OF_YOU),
        ),
      );
    const { rerender } = setup();
    rerender(1);
    await screen.findByText(titleFor('thinking'));
    rerender(2);
    await screen.findByText(titleFor('kiss'));
    expect(receipt()).toHaveLength(1);
  });

  it('does not interrupt a composer or steal its focus', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.THINKING_OF_YOU)),
    );
    const { rerender } = setup();
    const composer = document.createElement('textarea');
    document.body.append(composer);
    composer.focus();
    rerender(1);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(receipt()).toHaveLength(0);
    expect(document.activeElement).toBe(composer);
    // Nothing is fetched or shown later as a delayed interruption.
    composer.blur();
    composer.remove();
    rerender(1);
    await act(async () => undefined);
    expect(receipt()).toHaveLength(0);
  });

  it('stays silent in a window without focus', async () => {
    vi.mocked(document.hasFocus).mockReturnValue(false);
    const { rerender } = setup();
    rerender(1);
    await act(async () => undefined);
    expect(notifications.getNotifications).not.toHaveBeenCalled();
  });

  it('never shows a stale result after an Account change', async () => {
    let resolve!: (value: unknown) => void;
    notifications.getNotifications.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { rerender } = setup();
    rerender(1);
    await waitFor(() =>
      expect(notifications.getNotifications).toHaveBeenCalled(),
    );
    rerender(1, 'account-other');
    await act(async () =>
      resolve(page(gesture('g', NotificationKind.THINKING_OF_YOU))),
    );
    expect(receipt()).toHaveLength(0);
  });

  it('closes itself, but holds while focus is inside, and closes on Escape', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.THINKING_OF_YOU)),
    );
    const { rerender } = setup();
    rerender(1);
    const surface = await screen.findByTestId('partner-gesture-receipt');
    expect(document.activeElement).toBe(document.body);
    const close = screen.getByRole('button', { name: copy.close });
    act(() => close.focus());
    await act(async () =>
      vi.advanceTimersByTimeAsync(PARTNER_GESTURE_RECEIPT_VISIBLE_MS + 100),
    );
    expect(surface.isConnected).toBe(true);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(surface.getAttribute('data-presence')).toBe('exiting');
    finishExit();
    expect(receipt()).toHaveLength(0);
  });

  it('auto-dismisses after the reading time', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.THINKING_OF_YOU)),
    );
    const { rerender } = setup();
    rerender(1);
    await screen.findByTestId('partner-gesture-receipt');
    await act(async () =>
      vi.advanceTimersByTimeAsync(PARTNER_GESTURE_RECEIPT_VISIBLE_MS + 100),
    );
    finishExit();
    expect(receipt()).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('replies to a thought through the existing THINKING send, once', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.THINKING_OF_YOU)),
    );
    notifications.sendThinkingOfYou.mockResolvedValue({
      thinkingOfYouAvailableAt: new Date(clock + 30 * 60_000),
    });
    const { rerender } = setup();
    rerender(1);
    const reply = await screen.findByRole('button', {
      name: copy.thinking.reply,
    });
    fireEvent.click(reply);
    fireEvent.click(reply);
    expect((await screen.findByText(quick.sentThinking)).isConnected).toBe(
      true,
    );
    expect(notifications.sendThinkingOfYou).toHaveBeenCalledTimes(1);
    expect(notifications.sendThinkingOfYou.mock.calls[0][0]).toMatchObject({
      spaceId: SPACE,
    });
    // "Sent" never claims delivery or reading.
    expect(quick.sentThinking).not.toMatch(/angekommen|gelesen|gesehen/);
  });

  it('does not offer a reply while the existing cooldown runs', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.THINKING_OF_YOU)),
    );
    const { client, rerender } = setup();
    client.setQueryData(dashboardQueryKey(SPACE), {
      thinkingOfYouAvailableAt: new Date(clock + 10 * 60_000),
    });
    rerender(1);
    await screen.findByTestId('partner-gesture-receipt');
    expect(
      screen.queryByRole('button', { name: copy.thinking.reply }),
    ).toBeNull();
  });

  it('shows the existing offline copy when a reply cannot be sent', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.THINKING_OF_YOU)),
    );
    const { rerender } = setup();
    rerender(1);
    const reply = await screen.findByRole('button', {
      name: copy.thinking.reply,
    });
    onlineManager.setOnline(false);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent.click(reply);
    expect((await screen.findByRole('alert')).textContent).toContain(
      quick.offline,
    );
    expect(notifications.sendThinkingOfYou).not.toHaveBeenCalled();
    // The receipt stays until the person closes it.
    await act(async () =>
      vi.advanceTimersByTimeAsync(PARTNER_GESTURE_RECEIPT_VISIBLE_MS + 100),
    );
    expect(receipt()).toHaveLength(1);
  });

  it('sends a kiss back only with the extended capability', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.PARTNER_KISS)),
    );
    notifications.sendPartnerQuickAction.mockResolvedValue({
      kind: SupportGestureKind.KISS,
      availableAt: new Date(clock + 30 * 60_000),
    });
    const { rerender } = setup({
      capabilities: ['partner.quick_actions.extended'],
    });
    rerender(1);
    fireEvent.click(
      await screen.findByRole('button', { name: copy.kiss.reply }),
    );
    expect((await screen.findByText(quick.sentKiss)).isConnected).toBe(true);
    expect(
      notifications.sendPartnerQuickAction.mock.calls[0][0]
        .partnerQuickActionCreate.kind,
    ).toBe(SupportGestureKind.KISS);
  });

  it('uses the existing Pro discovery instead of an unauthorized kiss', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.PARTNER_KISS)),
    );
    const { rerender } = setup({ capabilities: [] });
    rerender(1);
    const reply = await screen.findByRole('button', {
      name: new RegExp(copy.kiss.reply),
    });
    expect(reply.textContent).toContain(quick.pro);
    fireEvent.click(reply);
    expect(notifications.sendPartnerQuickAction).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toContain(
      proPaywallPath(),
    );
  });

  it('reads no entitlement: without a cached view no kiss reply is offered', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.PARTNER_KISS)),
    );
    const { rerender } = setup();
    rerender(1);
    await screen.findByText(titleFor('kiss'));
    expect(screen.queryByRole('button', { name: copy.kiss.reply })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers "share how you feel" only when the check-in is enabled', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(gesture('g', NotificationKind.PARTNER_CHECK_IN)),
    );
    const off = setup();
    off.rerender(1);
    await screen.findByText(titleFor('checkIn'));
    expect(
      screen.queryByRole('button', { name: copy.checkIn.reply }),
    ).toBeNull();
    cleanup();

    const on = setup({
      configuration: { supportGesturesEnabled: true, vibeCheckEnabled: true },
    });
    on.rerender(1);
    fireEvent.click(
      await screen.findByRole('button', { name: copy.checkIn.reply }),
    );
    expect(screen.getByTestId('location').textContent).toContain(
      `/today|{"${OPEN_OWN_DAILY_CHECK_IN_STATE}":true}`,
    );
    expect(notifications.sendPartnerQuickAction).not.toHaveBeenCalled();
  });

  it('presents a deliberately opened push gesture only for its own scope', async () => {
    setup();
    act(() =>
      requestPartnerGestureReceipt({
        scope: receiptScope('someone-else', SPACE),
        item: gesture('p', NotificationKind.THINKING_OF_YOU),
      }),
    );
    expect(receipt()).toHaveLength(0);
    act(() =>
      requestPartnerGestureReceipt({
        scope: receiptScope(ACCOUNT, SPACE),
        item: gesture('p', NotificationKind.THINKING_OF_YOU, {
          readAt: new Date(clock),
        }),
      }),
    );
    expect((await screen.findByText(titleFor('thinking'))).isConnected).toBe(
      true,
    );
  });

  it('shows the anonymous copy when no actor is available', async () => {
    notifications.getNotifications.mockResolvedValue(
      page(
        gesture('g', NotificationKind.PARTNER_CHECK_IN, {
          actor: null,
          actorId: null,
        }),
      ),
    );
    const { rerender } = setup();
    rerender(1);
    expect((await screen.findByText(copy.checkIn.titleAnon)).isConnected).toBe(
      true,
    );
  });

  it('ignores a failed arrival read without any visible error', async () => {
    notifications.getNotifications.mockRejectedValue(
      new ClientProblemError('offline'),
    );
    const { rerender } = setup();
    rerender(1);
    await act(async () => undefined);
    expect(receipt()).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
