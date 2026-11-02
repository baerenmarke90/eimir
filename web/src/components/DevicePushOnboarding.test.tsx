// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { DevicePushController } from '../client/devicePush';
import { postSnackbar } from '../client/snackbar';
import copy from '../i18n/locales/notificationSettings';
import { DevicePushOnboarding } from './DevicePushOnboarding';

const environment = vi.hoisted(() => ({ blocked: false, online: true }));
vi.mock('../client/useDocumentLeaveGuard', () => ({
  useDocumentLeaveBlocked: () => environment.blocked,
}));
vi.mock('../client/connectivity', () => ({
  isClientOnline: () => environment.online,
}));
vi.mock('../client/snackbar', () => ({ postSnackbar: vi.fn() }));

let accountSequence = 0;
let accountId: string;
const apiBaseUrl = 'https://demo.eimir.ur-cloud.de';
let storage: Map<string, string>;

beforeEach(() => {
  accountId = `account-${++accountSequence}`;
  storage = new Map();
  environment.blocked = false;
  environment.online = true;
  vi.clearAllMocks();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((media: string) => ({
      matches: media === '(prefers-reduced-motion: reduce)',
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

function controller(
  overrides: Partial<DevicePushController> = {},
): DevicePushController {
  return {
    available: true,
    state: 'off',
    error: null,
    registered: false,
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
    openSettings: vi.fn(async () => {}),
    ...overrides,
  };
}

function setup(devicePush = controller()) {
  const props = { accountId, apiBaseUrl, devicePush };
  return { ...render(<DevicePushOnboarding {...props} />), props, devicePush };
}

it('asks before permission/registration and prevents duplicate activation', async () => {
  let finish!: () => void;
  const enable = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = setup(controller({ enable }));
  await screen.findByRole('dialog', { name: copy.onboardingTitle });
  expect(enable).not.toHaveBeenCalled();
  expect(screen.getByText(copy.deviceIntro)).not.toBeNull();
  const activate = screen.getByRole('button', {
    name: copy.onboardingActivate,
  });
  fireEvent.click(activate);
  fireEvent.click(activate);
  expect(enable).toHaveBeenCalledTimes(1);
  view.rerender(
    <DevicePushOnboarding
      {...view.props}
      devicePush={controller({ state: 'connecting', registered: true })}
    />,
  );
  expect(screen.getByRole('dialog')).not.toBeNull();
  expect(postSnackbar).not.toHaveBeenCalled();
  await act(async () => finish());
  view.rerender(
    <DevicePushOnboarding
      {...view.props}
      devicePush={controller({ state: 'on', registered: true })}
    />,
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(postSnackbar).toHaveBeenCalledExactlyOnceWith(
    'notificationSettings.deviceOn',
  );
});

it('remembers Later across remounts without enabling or disabling push', async () => {
  const view = setup();
  fireEvent.click(
    await screen.findByRole('button', { name: copy.onboardingLater }),
  );
  view.unmount();
  setup(view.devicePush);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(view.devicePush.enable).not.toHaveBeenCalled();
  expect(view.devicePush.disable).not.toHaveBeenCalled();
  expect([...storage.values()]).toEqual(['answered']);
});

it('keeps permission denial actionable without claiming successful registration', async () => {
  const view = setup();
  await act(async () => {
    fireEvent.click(
      await screen.findByRole('button', { name: copy.onboardingActivate }),
    );
  });
  const denied = controller({
    state: 'error',
    error: 'NOTIFICATION_PERMISSION_DENIED',
  });
  view.rerender(<DevicePushOnboarding {...view.props} devicePush={denied} />);
  expect(screen.getByRole('status').textContent).toContain(
    copy.devicePermissionDenied,
  );
  fireEvent.click(
    screen.getByRole('button', { name: copy.deviceOpenSettings }),
  );
  expect(denied.openSettings).toHaveBeenCalledTimes(1);
  expect(denied.enable).not.toHaveBeenCalled();
  expect(postSnackbar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: copy.onboardingLater }));
  view.unmount();
  setup();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it.each([
  { available: false },
  { state: 'loading' as const },
  { state: 'unavailable' as const },
  { state: 'on' as const, registered: true },
  { state: 'error' as const },
])('does not offer setup in an ineligible device state: %j', (state) => {
  const view = setup(controller(state));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(view.devicePush.enable).not.toHaveBeenCalled();
});

it('defers while offline or a draft is protected', async () => {
  environment.blocked = true;
  environment.online = false;
  const view = setup();
  expect(screen.queryByRole('dialog')).toBeNull();
  environment.blocked = false;
  view.rerender(<DevicePushOnboarding {...view.props} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  environment.online = true;
  view.rerender(
    <DevicePushOnboarding
      {...view.props}
      devicePush={controller({ state: 'loading' })}
    />,
  );
  view.rerender(<DevicePushOnboarding {...view.props} />);
  await screen.findByRole('dialog');
});

it('keeps decisions scoped to the account and API instance', async () => {
  const view = setup();
  fireEvent.click(
    await screen.findByRole('button', { name: copy.onboardingLater }),
  );
  view.unmount();
  const other = render(
    <DevicePushOnboarding {...view.props} accountId="different-owner" />,
  );
  await screen.findByRole('dialog');
  other.unmount();
  render(
    <DevicePushOnboarding {...view.props} apiBaseUrl="https://other.example" />,
  );
  await screen.findByRole('dialog');
});

it('does not automatically ask when the decision store cannot be read', () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('blocked');
    },
  });
  setup();
  expect(screen.queryByRole('dialog')).toBeNull();
});
