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
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import '../i18n';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { SupportGestureKind } from '../api/generated/models/SupportGestureKind';
import { ClientProblemError } from '../client/problemDetails';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { partnerQuickActionsEntitlementQueryKey } from '../client/partnerQuickActions';
import { SNACKBAR_EVENT, type SnackbarEventDetail } from '../client/snackbar';
import type { M4ProductApis } from '../client/m4Product';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import type { CouplePresenceAvatarAction } from './CouplePresence';
import { PartnerQuickActions } from './PartnerQuickActions';

const { partnerQuickActions: copy } = relationshipComponents;

afterEach(() => cleanup());

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    // Compact is normative: no query in this suite matches, so
    // `useMediaQuery` falls back to its Compact-leaning default.
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function AvatarTrigger({ action }: { action: CouplePresenceAvatarAction }) {
  return (
    <button
      type="button"
      ref={action.ref}
      onClick={action.onActivate}
      aria-label={action.label}
      aria-expanded={action.expanded}
      aria-controls={action.controls}
      aria-haspopup={action.hasPopup}
    >
      avatar
    </button>
  );
}

function renderQuickActions({
  apis,
  entitlementApi,
  thinkingOfYouAvailableAt = null,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
  accountId = 'account-1',
  spaceId = 'space-1',
}: {
  apis?: Partial<M4ProductApis['notifications']>;
  entitlementApi?: Partial<EntitlementsApi>;
  thinkingOfYouAvailableAt?: Date | null;
  queryClient?: QueryClient;
  accountId?: string;
  spaceId?: string;
} = {}) {
  const snackbars: string[] = [];
  window.addEventListener(SNACKBAR_EVENT, (event) =>
    snackbars.push(
      (event as CustomEvent<SnackbarEventDetail>).detail.messageKey,
    ),
  );

  const resolvedEntitlementApi =
    entitlementApi ??
    ({
      getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: vi
        .fn()
        .mockResolvedValue({ capabilities: [] }),
    } as Partial<EntitlementsApi>);

  const element = (activeAccountId: string, activeSpaceId: string) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PartnerQuickActions
          apis={{ notifications: apis } as unknown as M4ProductApis}
          entitlementApi={resolvedEntitlementApi as unknown as EntitlementsApi}
          accountId={activeAccountId}
          spaceId={activeSpaceId}
          partnerName="Marie"
          thinkingOfYouAvailableAt={thinkingOfYouAvailableAt}
        >
          {(avatarAction, avatarOverlay) => (
            <>
              <AvatarTrigger action={avatarAction} />
              {avatarOverlay}
            </>
          )}
        </PartnerQuickActions>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(element(accountId, spaceId));

  return {
    queryClient,
    snackbars,
    unmount: view.unmount,
    switchScope: (nextAccountId: string, nextSpaceId: string) =>
      view.rerender(element(nextAccountId, nextSpaceId)),
  };
}

function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: /Marie/ }));
}

function fireReactAnimationEnd(element: Element): void {
  fireEvent.animationEnd(element);
  if (element.isConnected) {
    fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }));
  }
}

function mockResponsiveMatchMedia(): {
  setExpanded: (matches: boolean) => void;
} {
  let expanded = false;
  const expandedListeners = new Set<(event: MediaQueryListEvent) => void>();

  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const isExpandedQuery = query === '(min-width: 840px)';
    const mediaQuery = {
      get matches() {
        if (isExpandedQuery) return expanded;
        if (query === '(prefers-reduced-motion: reduce)') return false;
        return false;
      },
      media: query,
      onchange: null,
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        if (isExpandedQuery) expandedListeners.add(listener);
      }),
      removeListener: vi.fn(
        (listener: (event: MediaQueryListEvent) => void) => {
          if (isExpandedQuery) expandedListeners.delete(listener);
        },
      ),
      addEventListener: vi.fn(
        (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (isExpandedQuery && type === 'change') {
            expandedListeners.add(listener);
          }
        },
      ),
      removeEventListener: vi.fn(
        (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (isExpandedQuery && type === 'change') {
            expandedListeners.delete(listener);
          }
        },
      ),
      dispatchEvent: vi.fn(),
    };
    return mediaQuery;
  });

  return {
    setExpanded(matches: boolean) {
      expanded = matches;
      const event = {
        matches,
        media: '(min-width: 840px)',
      } as MediaQueryListEvent;
      act(() => {
        for (const listener of expandedListeners) listener(event);
      });
    },
  };
}

describe('PartnerQuickActions', () => {
  it('uses the confirmed cache cooldown before React delivers the next observer render', async () => {
    const sendThinkingOfYou = vi.fn().mockResolvedValue({
      thinkingOfYouAvailableAt: new Date(Date.now() + 60_000),
    });
    const view = renderQuickActions({ apis: { sendThinkingOfYou } });
    openSheet();
    const button = screen
      .getByText(copy.thinking)
      .closest('button') as HTMLButtonElement;
    let activated = false;
    const unsubscribe = view.queryClient
      .getMutationCache()
      .subscribe((event) => {
        if (
          event.type === 'updated' &&
          event.mutation.state.status === 'success' &&
          !activated
        ) {
          activated = true;
          button.click();
        }
      });
    try {
      await act(async () => button.click());
      await screen.findByText(copy.sentThinking);
      expect(activated).toBe(true);
      expect(sendThinkingOfYou).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('retires a request identity after an authoritative rejection and requires an explicit new attempt', async () => {
    const sendThinkingOfYou = vi
      .fn()
      .mockRejectedValueOnce(
        new ClientProblemError('validation', 422, 'VALIDATION_ERROR'),
      )
      .mockResolvedValue({
        thinkingOfYouAvailableAt: new Date(Date.now() + 60_000),
      });
    renderQuickActions({ apis: { sendThinkingOfYou } });
    openSheet();
    const button = screen
      .getByText(copy.thinking)
      .closest('button') as HTMLButtonElement;
    fireEvent.click(button);
    await screen.findByRole('alert');
    fireEvent.click(button);
    await screen.findByText(copy.sentThinking);
    expect(sendThinkingOfYou).toHaveBeenCalledTimes(2);
    expect(
      sendThinkingOfYou.mock.calls[1][0].thinkingOfYouCreate.clientRequestId,
    ).not.toBe(
      sendThinkingOfYou.mock.calls[0][0].thinkingOfYouCreate.clientRequestId,
    );
  });

  it('keeps one pending gesture across sender remounts and blocks a competing gesture', async () => {
    let resolve!: (result: { thinkingOfYouAvailableAt: Date }) => void;
    const sendThinkingOfYou = vi.fn().mockImplementation(
      () =>
        new Promise((accept) => {
          resolve = accept;
        }),
    );
    const sendPartnerQuickAction = vi.fn();
    const entitlementApi = {
      getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: vi
        .fn()
        .mockResolvedValue({
          capabilities: ['partner.quick_actions.extended'],
        }),
    };
    const first = renderQuickActions({
      apis: { sendThinkingOfYou, sendPartnerQuickAction },
      entitlementApi,
    });
    first.queryClient.setQueryData(dashboardQueryKey('space-1'), {
      thinkingOfYouAvailableAt: null,
    });
    openSheet();
    const thinking = screen
      .getByText(copy.thinking)
      .closest('button') as HTMLButtonElement;
    act(() => {
      thinking.click();
      thinking.click();
    });
    await waitFor(() => expect(sendThinkingOfYou).toHaveBeenCalledTimes(1));
    first.unmount();
    renderQuickActions({
      apis: { sendThinkingOfYou, sendPartnerQuickAction },
      entitlementApi,
      queryClient: first.queryClient,
    });
    openSheet();
    expect(
      screen
        .getByText(copy.thinking)
        .closest('button')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
    expect(screen.getByText(copy.sendingThinking).getAttribute('role')).toBe(
      'status',
    );
    expect(screen.queryByText(copy.sentThinking)).toBeNull();
    const kiss = (await screen.findByText(copy.kiss)).closest(
      'button',
    ) as HTMLButtonElement;
    fireEvent.click(kiss);
    expect(sendPartnerQuickAction).not.toHaveBeenCalled();
    await act(async () =>
      resolve({ thinkingOfYouAvailableAt: new Date(Date.now() + 60_000) }),
    );
    await waitFor(() =>
      expect(screen.queryByText(copy.sendingThinking)).toBeNull(),
    );
    expect(
      (screen.getByText(copy.thinking).closest('button') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      first.queryClient
        .getQueryData<{ thinkingOfYouAvailableAt: Date }>(
          dashboardQueryKey('space-1'),
        )
        ?.thinkingOfYouAvailableAt.getTime(),
    ).toBeGreaterThan(Date.now());
    expect(first.snackbars).toEqual([]);
  });

  it('announces pending without losing action focus, including same-task duplicate activation', async () => {
    let resolve!: (result: { thinkingOfYouAvailableAt: Date }) => void;
    const sendThinkingOfYou = vi.fn().mockImplementation(
      () =>
        new Promise((accept) => {
          resolve = accept;
        }),
    );
    renderQuickActions({ apis: { sendThinkingOfYou } });
    openSheet();
    const button = screen
      .getByText(copy.thinking)
      .closest('button') as HTMLButtonElement;
    button.focus();
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(sendThinkingOfYou).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(button);
    expect(
      screen.getByText(copy.sendingThinking).getAttribute('aria-live'),
    ).toBe('polite');
    expect(screen.queryByText(copy.sentThinking)).toBeNull();
    await act(async () =>
      resolve({ thinkingOfYouAvailableAt: new Date(Date.now() + 60_000) }),
    );
  });

  it('retains an uncertain failed request across remount and retries deliberately with the same identity', async () => {
    const sendThinkingOfYou = vi
      .fn()
      .mockRejectedValueOnce(new ClientProblemError('offline'))
      .mockResolvedValue({
        thinkingOfYouAvailableAt: new Date(Date.now() + 60_000),
      });
    const first = renderQuickActions({ apis: { sendThinkingOfYou } });
    openSheet();
    fireEvent.click(
      screen.getByText(copy.thinking).closest('button') as HTMLButtonElement,
    );
    await screen.findByRole('alert');
    const firstId =
      sendThinkingOfYou.mock.calls[0][0].thinkingOfYouCreate.clientRequestId;
    first.unmount();
    renderQuickActions({
      apis: { sendThinkingOfYou },
      queryClient: first.queryClient,
    });
    openSheet();
    expect(screen.getByRole('alert').textContent).toBe(copy.offline);
    expect(screen.queryByText(copy.sendingThinking)).toBeNull();
    fireEvent.click(
      screen.getByText(copy.thinking).closest('button') as HTMLButtonElement,
    );
    await screen.findByText(copy.sentThinking);
    expect(sendThinkingOfYou).toHaveBeenCalledTimes(2);
    expect(
      sendThinkingOfYou.mock.calls[1][0].thinkingOfYouCreate.clientRequestId,
    ).toBe(firstId);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retains an extended gesture cooldown across remount without manufacturing another send', async () => {
    const sendPartnerQuickAction = vi
      .fn()
      .mockResolvedValue({ availableAt: new Date(Date.now() + 60_000) });
    const entitlementApi = {
      getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: vi
        .fn()
        .mockResolvedValue({
          capabilities: ['partner.quick_actions.extended'],
        }),
    };
    const first = renderQuickActions({
      apis: { sendPartnerQuickAction },
      entitlementApi,
    });
    openSheet();
    fireEvent.click(
      (await screen.findByText(copy.kiss)).closest(
        'button',
      ) as HTMLButtonElement,
    );
    await screen.findByText(copy.sentKiss);
    first.unmount();
    renderQuickActions({
      apis: { sendPartnerQuickAction },
      entitlementApi,
      queryClient: first.queryClient,
    });
    openSheet();
    const kiss = (await screen.findByText(copy.kiss)).closest(
      'button',
    ) as HTMLButtonElement;
    expect(kiss.disabled).toBe(true);
    fireEvent.click(kiss);
    expect(sendPartnerQuickAction).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByText(copy.checkIn).closest('button') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it.each([
    ['account-2', 'space-1'],
    ['account-1', 'space-2'],
  ])(
    'isolates pending and late success after switching to %s/%s',
    async (accountId, spaceId) => {
      let resolve!: (result: { thinkingOfYouAvailableAt: Date }) => void;
      const sendThinkingOfYou = vi.fn().mockImplementation(
        () =>
          new Promise((accept) => {
            resolve = accept;
          }),
      );
      const first = renderQuickActions({ apis: { sendThinkingOfYou } });
      openSheet();
      fireEvent.click(
        screen.getByText(copy.thinking).closest('button') as HTMLButtonElement,
      );
      await screen.findByText(copy.sendingThinking);
      first.switchScope(accountId, spaceId);
      expect(screen.queryByText(copy.sendingThinking)).toBeNull();
      expect(
        screen
          .getByText(copy.thinking)
          .closest('button')
          ?.getAttribute('aria-disabled'),
      ).toBeNull();
      await act(async () =>
        resolve({ thinkingOfYouAvailableAt: new Date(Date.now() + 60_000) }),
      );
      expect(screen.queryByText(copy.sentThinking)).toBeNull();
      expect(first.snackbars).toEqual([]);
    },
  );

  it('does not reconcile or announce a late response after cache clear and query replacement', async () => {
    let resolve!: (result: { thinkingOfYouAvailableAt: Date }) => void;
    const sendThinkingOfYou = vi.fn().mockImplementation(
      () =>
        new Promise((accept) => {
          resolve = accept;
        }),
    );
    const first = renderQuickActions({ apis: { sendThinkingOfYou } });
    const key = dashboardQueryKey('space-1');
    first.queryClient.setQueryData(key, { thinkingOfYouAvailableAt: null });
    openSheet();
    fireEvent.click(
      screen.getByText(copy.thinking).closest('button') as HTMLButtonElement,
    );
    await screen.findByText(copy.sendingThinking);
    first.unmount();
    first.queryClient.clear();
    first.queryClient.setQueryData(key, { thinkingOfYouAvailableAt: null });
    first.queryClient.setQueryData(
      partnerQuickActionsEntitlementQueryKey('account-1', 'space-1'),
      false,
    );
    await act(async () =>
      resolve({ thinkingOfYouAvailableAt: new Date(Date.now() + 60_000) }),
    );
    expect(first.queryClient.getQueryData(key)).toEqual({
      thinkingOfYouAvailableAt: null,
    });
    expect(first.snackbars).toEqual([]);
  });

  it('fails an offline gesture without queuing it for reconnect and requires another activation', async () => {
    const sendThinkingOfYou = vi.fn().mockResolvedValue({
      thinkingOfYouAvailableAt: new Date(Date.now() + 60_000),
    });
    renderQuickActions({ apis: { sendThinkingOfYou } });
    openSheet();
    try {
      onlineManager.setOnline(false);
      fireEvent.click(
        screen.getByText(copy.thinking).closest('button') as HTMLButtonElement,
      );
      await screen.findByRole('alert');
      expect(sendThinkingOfYou).not.toHaveBeenCalled();
      await act(async () => onlineManager.setOnline(true));
      expect(sendThinkingOfYou).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByText(copy.thinking).closest('button') as HTMLButtonElement,
      );
      await waitFor(() => expect(sendThinkingOfYou).toHaveBeenCalledTimes(1));
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('exposes the avatar as a closed dialog trigger and opens the Compact sheet on activation', async () => {
    renderQuickActions();

    const trigger = screen.getByRole('button', { name: /Marie/ });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(copy.thinking)).toBeNull();

    openSheet();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(copy.thinking)).toBeDefined();
    expect(await screen.findByText(copy.kiss)).toBeDefined();
    expect(screen.getByText(copy.checkIn)).toBeDefined();
  });

  it('hands an open Compact sheet to Expanded only after retained exit completes, then returns cleanly to Compact', async () => {
    const responsive = mockResponsiveMatchMedia();
    renderQuickActions();
    openSheet();

    const trigger = screen.getByRole('button', { name: /Marie/ });
    const sheet = screen.getByRole('dialog', {
      name: copy.title.replace('{{partner}}', 'Marie'),
    });

    expect(sheet.getAttribute('id')).toBe('partner-quick-actions-sheet');
    expect(document.querySelector('.partner-quick-actions-popover')).toBeNull();

    responsive.setExpanded(true);

    await waitFor(() =>
      expect(sheet.getAttribute('data-presence')).toBe('exiting'),
    );
    expect(document.body.contains(sheet)).toBe(true);
    expect(document.querySelector('.partner-quick-actions-popover')).toBeNull();
    expect(trigger.getAttribute('aria-controls')).toBe(
      'partner-quick-actions-sheet',
    );

    fireReactAnimationEnd(sheet);

    await waitFor(() => expect(document.body.contains(sheet)).toBe(false));
    await waitFor(() =>
      expect(
        document.querySelector('.partner-quick-actions-popover'),
      ).not.toBeNull(),
    );
    expect(trigger.getAttribute('aria-controls')).toBe(
      'partner-quick-actions-popover',
    );
    expect(document.body.style.overflow).not.toBe('hidden');

    const popover = document.querySelector(
      '.partner-quick-actions-popover',
    ) as HTMLElement;
    responsive.setExpanded(false);

    await waitFor(() =>
      expect(popover.getAttribute('data-presence')).toBe('exiting'),
    );
    expect(document.querySelector('.short-task-sheet')).toBeNull();
    expect(trigger.getAttribute('aria-controls')).toBe(
      'partner-quick-actions-popover',
    );

    fireReactAnimationEnd(popover);

    await waitFor(() =>
      expect(document.querySelector('.short-task-sheet')).not.toBeNull(),
    );
    expect(document.querySelector('.partner-quick-actions-popover')).toBeNull();
    expect(trigger.getAttribute('aria-controls')).toBe(
      'partner-quick-actions-sheet',
    );
  });

  it('reflects a server-authoritative Thinking-of-you cooldown from load without sending (regression #790/#791)', () => {
    renderQuickActions({
      thinkingOfYouAvailableAt: new Date(Date.now() + 29 * 60_000),
    });

    openSheet();

    const thinkingButton = screen
      .getByText(copy.thinking)
      .closest('button') as HTMLButtonElement;
    expect(thinkingButton).not.toBeNull();
    expect(thinkingButton.disabled).toBe(true);
    expect(screen.getAllByText(copy.cooldown).length).toBeGreaterThan(0);
  });

  it('reenables Thinking-of-you when the server-authoritative cooldown expires while the hub stays open', () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-09-22T20:00:00Z');
      vi.setSystemTime(now);
      renderQuickActions({
        thinkingOfYouAvailableAt: new Date(now.getTime() + 1_000),
      });

      openSheet();
      const thinkingButton = screen
        .getByText(copy.thinking)
        .closest('button') as HTMLButtonElement;
      expect(thinkingButton.disabled).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1_001);
      });

      expect(thinkingButton.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not disable Thinking-of-you when no cooldown is active, and sends on activation', async () => {
    const sendThinkingOfYou = vi.fn().mockResolvedValue({
      thinkingOfYouAvailableAt: new Date(Date.now() + 30 * 60_000),
    });
    renderQuickActions({ apis: { sendThinkingOfYou } });

    openSheet();

    const thinkingButton = screen
      .getByText(copy.thinking)
      .closest('button') as HTMLButtonElement;
    expect(thinkingButton.disabled).toBe(false);

    fireEvent.click(thinkingButton);

    await waitFor(() => expect(sendThinkingOfYou).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(thinkingButton.disabled).toBe(true));
    expect(screen.getByText(copy.sentThinking)).toBeDefined();
  });

  it('gates the extended gestures behind the central entitlement and offers the upgrade flow when absent', async () => {
    const getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet = vi
      .fn()
      .mockResolvedValue({ capabilities: [] });
    renderQuickActions({
      entitlementApi: {
        getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet,
      },
    });

    openSheet();

    await waitFor(() =>
      expect(
        getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet,
      ).toHaveBeenCalledTimes(1),
    );

    const kissButton = await screen.findByText(copy.kiss);
    const kissButtonEl = kissButton.closest('button') as HTMLButtonElement;
    expect(kissButtonEl.disabled).toBe(false);
    expect(screen.getAllByText(copy.pro).length).toBeGreaterThan(0);

    fireEvent.click(kissButtonEl);

    expect(
      await screen.findByText(copy.premiumHint, { exact: false }),
    ).toBeDefined();
  });

  it('sends an extended gesture once the central entitlement grants the capability', async () => {
    const getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet = vi
      .fn()
      .mockResolvedValue({ capabilities: ['partner.quick_actions.extended'] });
    const sendPartnerQuickAction = vi.fn().mockResolvedValue({
      kind: SupportGestureKind.KISS,
      clientRequestId: 'req-1',
      availableAt: new Date(Date.now() + 30 * 60_000),
    });
    renderQuickActions({
      apis: { sendPartnerQuickAction },
      entitlementApi: {
        getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet,
      },
    });

    openSheet();

    const kissButton = (await screen.findByText(copy.kiss)).closest(
      'button',
    ) as HTMLButtonElement;
    await waitFor(() => expect(kissButton.disabled).toBe(false));

    fireEvent.click(kissButton);

    await waitFor(() =>
      expect(sendPartnerQuickAction).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: 'space-1',
          partnerQuickActionCreate: expect.objectContaining({
            kind: SupportGestureKind.KISS,
          }),
        }),
      ),
    );
    await waitFor(() => expect(kissButton.disabled).toBe(true));
    expect(screen.getByText(copy.sentKiss)).toBeDefined();
  });

  it('uses server Retry-After to disable Thinking-of-you after a cooldown response', async () => {
    const sendThinkingOfYou = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError(
          'rateLimit',
          429,
          'THINKING_OF_YOU_COOLDOWN',
          60,
        ),
      );
    renderQuickActions({ apis: { sendThinkingOfYou } });

    openSheet();
    const thinkingButton = screen
      .getByText(copy.thinking)
      .closest('button') as HTMLButtonElement;
    fireEvent.click(thinkingButton);

    expect((await screen.findByRole('alert')).textContent).toContain(
      copy.cooldown,
    );
    expect(thinkingButton.disabled).toBe(true);
    fireEvent.click(thinkingButton);
    expect(sendThinkingOfYou).toHaveBeenCalledTimes(1);
  });

  it('uses server Retry-After to disable an extended gesture after a stale cooldown response', async () => {
    const sendPartnerQuickAction = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError(
          'rateLimit',
          429,
          'SUPPORT_GESTURE_COOLDOWN',
          60,
        ),
      );
    renderQuickActions({
      apis: { sendPartnerQuickAction },
      entitlementApi: {
        getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: vi
          .fn()
          .mockResolvedValue({
            capabilities: ['partner.quick_actions.extended'],
          }),
      },
    });

    openSheet();
    const kissButton = (await screen.findByText(copy.kiss)).closest(
      'button',
    ) as HTMLButtonElement;
    await waitFor(() => expect(kissButton.disabled).toBe(false));

    fireEvent.click(kissButton);

    expect((await screen.findByRole('alert')).textContent).toContain(
      copy.cooldown,
    );
    await waitFor(() => expect(kissButton.disabled).toBe(true));
    fireEvent.click(kissButton);
    expect(sendPartnerQuickAction).toHaveBeenCalledTimes(1);
  });
});
