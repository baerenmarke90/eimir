import copy from '../i18n/locales/notificationSettings';
// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { DevicePushController } from '../client/devicePush';
import { useDocumentLeaveGuard } from '../client/useDocumentLeaveGuard';
import { DevicePushIntroduction } from './DevicePushIntroduction';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function controller(
  overrides: Partial<DevicePushController> = {},
): DevicePushController {
  return {
    available: true,
    state: 'off',
    error: null,
    registered: false,
    enable: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn(),
    openSettings: vi.fn(),
    ...overrides,
  };
}
function Task({
  push,
  account = 'one',
  api = 'https://api.example.test',
  dirty = false,
}: {
  push: DevicePushController;
  account?: string;
  api?: string;
  dirty?: boolean;
}) {
  useDocumentLeaveGuard(dirty);
  return (
    <DevicePushIntroduction
      accountId={account}
      apiBaseUrl={api}
      devicePush={push}
    />
  );
}
const dialog = () =>
  screen.queryByRole('dialog', { name: copy.introductionTitle });
const allow = () =>
  screen.getByRole('button', { name: copy.introductionAllow });

it('offers an explicit choice without permission, provider or preference writes on mount', async () => {
  const push = controller();
  render(<Task push={push} />);
  await waitFor(() => expect(dialog()).not.toBeNull());
  expect(document.activeElement).toBe(allow());
  expect(push.enable).not.toHaveBeenCalled();
  expect(push.disable).not.toHaveBeenCalled();
});

it('remembers Not now across remounts while allowing another Account and API their own choice', async () => {
  const push = controller();
  const view = render(<Task push={push} />);
  fireEvent.click(screen.getByRole('button', { name: copy.introductionSkip }));
  await waitFor(() => expect(dialog()).toBeNull());
  view.unmount();
  const next = render(<Task push={push} />);
  expect(dialog()).toBeNull();
  next.rerender(<Task push={push} account="two" />);
  await waitFor(() => expect(dialog()).not.toBeNull());
  fireEvent.click(screen.getByRole('button', { name: copy.introductionSkip }));
  next.rerender(
    <Task push={push} account="two" api="https://other.example.test" />,
  );
  await waitFor(() => expect(dialog()).not.toBeNull());
  expect(push.enable).not.toHaveBeenCalled();
});

it('does not mistake native permission completion for confirmed server registration', async () => {
  const push = controller();
  const view = render(<Task push={push} />);
  const trigger = allow();
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  expect(push.enable).toHaveBeenCalledTimes(1);
  view.rerender(
    <Task push={{ ...push, state: 'connecting', registered: true }} />,
  );
  expect(dialog()).not.toBeNull();
  expect(
    screen
      .getByRole('button', { name: 'Erneut versuchen' })
      .hasAttribute('disabled'),
  ).toBe(true);
  await waitFor(() => expect(push.enable).toHaveBeenCalledTimes(1));
  view.rerender(<Task push={{ ...push, state: 'on', registered: true }} />);
  await waitFor(() => expect(dialog()).toBeNull());
});

it('reuses denial recovery and retains retryable errors without claiming success', async () => {
  const push = controller();
  const view = render(<Task push={push} />);
  fireEvent.click(allow());
  view.rerender(
    <Task
      push={{
        ...push,
        state: 'error',
        error: 'NOTIFICATION_PERMISSION_DENIED',
      }}
    />,
  );
  const settings = await screen.findByRole('button', {
    name: copy.deviceOpenSettings,
  });
  fireEvent.click(settings);
  expect(push.openSettings).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).toBeNull();
  view.rerender(
    <Task
      push={{
        ...push,
        state: 'error',
        error: 'PUSH_DEVICE_REGISTRATION_FAILED',
      }}
    />,
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Erneut versuchen' }),
    ).not.toBeNull(),
  );
  expect(dialog()).not.toBeNull();
});

it.each(['loading', 'unavailable', 'error', 'on'] as const)(
  'does not introduce unavailable or already active state %s',
  (state) => {
    const push = controller({ state, registered: state === 'on' });
    render(<Task push={push} />);
    expect(dialog()).toBeNull();
    expect(push.enable).not.toHaveBeenCalled();
  },
);

it('defers during a dirty task and offers it after that task completes', async () => {
  const push = controller();
  const view = render(<Task push={push} dirty />);
  expect(dialog()).toBeNull();
  view.rerender(<Task push={push} />);
  await waitFor(() => expect(dialog()).not.toBeNull());
});

it('does not introduce browser devices or reopen after an existing activation is disabled', () => {
  const push = controller({ available: false });
  const view = render(<Task push={push} />);
  expect(dialog()).toBeNull();
  view.rerender(
    <Task push={{ ...push, available: true, state: 'on', registered: true }} />,
  );
  view.rerender(<Task push={{ ...push, available: true }} />);
  expect(dialog()).toBeNull();
});

it('remains dismissible when durable acknowledgment cannot be stored', async () => {
  const write = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('storage blocked');
    });
  try {
    const push = controller();
    render(<Task push={push} />);
    fireEvent.click(
      screen.getByRole('button', { name: copy.introductionSkip }),
    );
    await waitFor(() => expect(dialog()).toBeNull());
    expect(push.enable).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
