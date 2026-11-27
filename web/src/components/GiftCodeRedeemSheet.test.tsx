// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import type { RedeemGiftCodeRequest } from '../api/generated/apis/GiftCodesApi';
import type { GiftCodeRedemptionView } from '../api/generated/models/GiftCodeRedemptionView';
import { FetchError, ResponseError } from '../api/generated/runtime';
import { ApiRuntimeProvider } from '../client/apiRuntimeContext';
import { spaceEntitlementQueryKey } from '../client/spaceEntitlement';
import { instanceStatusQueryOptions } from '../client/supportReportsAvailability';
import { resolvedLocale } from '../i18n';
import proPaywall from '../i18n/locales/proPaywall';
import taskSheets from '../i18n/locales/taskSheets';
import {
  GiftCodeRedeemEntry,
  GiftCodeRedeemSheet,
} from './GiftCodeRedeemSheet';
import { ProSettingsRow } from './ProSettingsRow';

const platform = vi.hoisted(() => ({ native: false }));
vi.mock('../pwa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pwa')>()),
  isCapacitorNative: () => platform.native,
}));

const API_BASE = 'http://api.example.test';
const copy = proPaywall.giftCode;
const UNTIL = new Date('2027-05-26T10:00:00Z');

function problem(status: number, code: string): ResponseError {
  return new ResponseError(
    new Response(
      JSON.stringify({
        type: 'about:blank',
        title: 'Problem',
        status,
        detail: 'Problem',
        code,
      }),
      { status, headers: { 'Content-Type': 'application/problem+json' } },
    ),
  );
}

function longDate(date: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'long',
  }).format(date);
}

function fill(template: string, date: Date): string {
  return template.replace('{{date}}', longDate(date));
}

function providers(client: QueryClient, children: React.ReactNode) {
  return (
    <QueryClientProvider client={client}>
      <ApiRuntimeProvider
        apiBaseUrl={API_BASE}
        accessToken="token"
        accountId="account-1"
        spaceId="space-1"
      >
        <MemoryRouter>{children}</MemoryRouter>
      </ApiRuntimeProvider>
    </QueryClientProvider>
  );
}

function setup(
  behaviour: (
    call: RedeemGiftCodeRequest,
  ) => Promise<GiftCodeRedemptionView> = async () => ({
    effectiveUntil: UNTIL,
    extended: false,
  }),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const redeemGiftCode = vi.fn(behaviour);
  const onClose = vi.fn();
  const view = (open: boolean) =>
    providers(
      client,
      <GiftCodeRedeemSheet
        open={open}
        onClose={onClose}
        api={{ redeemGiftCode }}
      />,
    );
  const rendered = render(view(true));
  return {
    ...rendered,
    client,
    invalidate,
    redeemGiftCode,
    onClose,
    rerenderOpen: (open: boolean) => rendered.rerender(view(open)),
  };
}

function codeField() {
  return screen.getByRole('textbox', { name: copy.fieldLabel });
}

async function submit(name: string = copy.redeem) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

function renderEntry(
  available: boolean | undefined,
  entry: React.ReactNode = <GiftCodeRedeemEntry />,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (available !== undefined)
    client.setQueryData(instanceStatusQueryOptions(API_BASE).queryKey, {
      giftCodesAvailable: available,
    });
  render(providers(client, entry));
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  platform.native = false;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GiftCodeRedeemEntry', () => {
  it('is a quiet entry on web Cloud that opens the redeem sheet', () => {
    renderEntry(true);
    const entry = screen.getByRole('button', { name: copy.title });
    // Quiet: never the filled primary action of the Pro page.
    expect(entry.className).toContain('tertiary');
    expect(entry.className).not.toContain('button-link-primary');
    fireEvent.click(entry);
    expect(screen.getByRole('dialog', { name: copy.title })).toBeTruthy();
    expect(screen.getByText(copy.hint)).toBeTruthy();
  });

  it('is hidden where redemption is unavailable', () => {
    renderEntry(false);
    expect(screen.queryByRole('button', { name: copy.title })).toBeNull();
  });

  it('is hidden while the instance status is unknown', () => {
    renderEntry(undefined);
    expect(screen.queryByRole('button', { name: copy.title })).toBeNull();
  });

  it('is hidden in the native app whatever the instance offers', () => {
    platform.native = true;
    renderEntry(true);
    expect(screen.queryByRole('button', { name: copy.title })).toBeNull();
  });

  it('keeps an open sheet with its code when the status turns unavailable', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = instanceStatusQueryOptions(API_BASE).queryKey;
    client.setQueryData(key, { giftCodesAvailable: true });
    render(providers(client, <GiftCodeRedeemEntry />));
    fireEvent.click(screen.getByRole('button', { name: copy.title }));
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C' } });

    // A failed background refetch reads as unavailable.
    act(() => {
      client.setQueryData(key, { giftCodesAvailable: false });
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: copy.title })).toBeNull(),
    );
    expect(screen.getByRole('dialog', { name: copy.title })).toBeTruthy();
    expect((codeField() as HTMLInputElement).value).toBe('EIMIR-AB2C');

    fireEvent.click(screen.getByRole('button', { name: taskSheets.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: copy.title })).toBeNull();
  });

  it('also sits in the eimir. Pro block of the account settings', () => {
    renderEntry(true, <ProSettingsRow />);
    expect(screen.getByRole('button', { name: copy.title })).toBeTruthy();
  });

  it('is absent from the account settings where unavailable', () => {
    renderEntry(false, <ProSettingsRow />);
    expect(screen.queryByRole('button', { name: copy.title })).toBeNull();
  });
});

describe('GiftCodeRedeemSheet', () => {
  it('offers one paste-friendly code field and focuses it', () => {
    setup();
    const field = codeField() as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(field.placeholder).toBe(copy.placeholder);
    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(field.getAttribute('autocapitalize')).toBe('characters');
    expect(field.getAttribute('spellcheck')).toBe('false');
    // No price and no plan picker in the sheet.
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('keeps the typed value for the caret and sends it upper-cased', async () => {
    const { redeemGiftCode } = setup();
    fireEvent.change(codeField(), { target: { value: 'eimir-ab2c-d3ef ' } });
    // Capitals are shown by the field's CSS; the value stays as typed so
    // editing in the middle never moves the caret to the end.
    expect((codeField() as HTMLInputElement).value).toBe('eimir-ab2c-d3ef ');
    expect(codeField().className).toContain('gift-code-redeem-field');
    await submit();
    expect(redeemGiftCode).toHaveBeenCalledWith({
      spaceId: 'space-1',
      giftCodeRedeemRequest: { code: 'EIMIR-AB2C-D3EF ' },
    });
  });

  it('cannot be sent empty', () => {
    setup();
    const action = screen.getByRole('button', {
      name: copy.redeem,
    }) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
  });

  it('shows the pending label once and ignores a second press', async () => {
    let finish: (value: GiftCodeRedemptionView) => void = () => {};
    const { redeemGiftCode } = setup(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
    await submit();
    const pending = await screen.findByRole('button', {
      name: copy.redeeming,
    });
    expect(pending.getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      fireEvent.click(pending);
    });
    expect(redeemGiftCode).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ effectiveUntil: UNTIL, extended: false });
    });
  });

  it('confirms a new grant with its end date and refreshes the entitlement', async () => {
    const { invalidate, onClose } = setup();
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
    await submit();

    expect(
      screen.getByRole('dialog', { name: copy.success.new.title }),
    ).toBeTruthy();
    const result = screen.getByText(fill(copy.success.new.body, UNTIL));
    expect(document.activeElement).toBe(result.closest('[tabindex="-1"]'));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: spaceEntitlementQueryKey('account-1', 'space-1'),
    });
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: copy.done }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirms an extension with the new end date', async () => {
    setup(async () => ({ effectiveUntil: UNTIL, extended: true }));
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
    await submit();
    expect(
      screen.getByRole('dialog', { name: copy.success.extended.title }),
    ).toBeTruthy();
    expect(
      screen.getByText(fill(copy.success.extended.body, UNTIL)),
    ).toBeTruthy();
  });

  it('starts empty again after a confirmed code was closed', async () => {
    const { rerenderOpen } = setup();
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
    await submit();
    fireEvent.click(screen.getByRole('button', { name: copy.done }));
    rerenderOpen(false);
    rerenderOpen(true);
    expect((codeField() as HTMLInputElement).value).toBe('');
  });

  it('keeps a typed code when the sheet is closed and reopened', () => {
    const { rerenderOpen } = setup();
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C' } });
    rerenderOpen(false);
    rerenderOpen(true);
    expect((codeField() as HTMLInputElement).value).toBe('EIMIR-AB2C');
  });

  it.each([
    [422, 'GIFT_CODE_INVALID', copy.errors.invalid],
    [422, 'VALIDATION_FAILED', copy.errors.invalid],
    [409, 'GIFT_CODE_USED', copy.errors.used],
    [409, 'GIFT_CODE_SUBSCRIPTION_ACTIVE', copy.errors.subscriptionActive],
    [409, 'GIFT_CODE_UNLIMITED', copy.errors.unlimited],
    [429, 'RATE_LIMITED', copy.errors.rateLimited],
    [503, 'SERVICE_UNAVAILABLE', copy.errors.network],
  ])(
    'explains %s %s next to the field and keeps the code',
    async (status, code, message) => {
      const { invalidate } = setup(async () => {
        throw problem(status, code);
      });
      fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
      await submit();

      const explanation = screen.getByText(message);
      const field = codeField() as HTMLInputElement;
      expect(field.value).toBe('EIMIR-AB2C-D3EF');
      expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(
        explanation.id,
      );
      expect(document.activeElement).toBe(explanation);
      expect(invalidate).not.toHaveBeenCalled();
      // The same action tries again.
      expect(screen.getByRole('button', { name: copy.redeem })).toBeTruthy();
    },
  );

  it('marks only a wrong or used code as an invalid entry', async () => {
    let next = problem(422, 'GIFT_CODE_INVALID');
    setup(async () => {
      throw next;
    });
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
    await submit();
    expect(codeField().getAttribute('aria-invalid')).toBe('true');

    next = problem(409, 'GIFT_CODE_SUBSCRIPTION_ACTIVE');
    await submit();
    expect(codeField().getAttribute('aria-invalid')).toBeNull();
  });

  it('renews the instance status when the redeem route is gone', async () => {
    const { invalidate } = setup(async () => {
      throw problem(404, 'GIFT_CODES_NOT_FOUND');
    });
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
    await submit();
    expect(document.activeElement).toBe(screen.getByText(copy.errors.network));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: instanceStatusQueryOptions(API_BASE).queryKey,
    });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: spaceEntitlementQueryKey('account-1', 'space-1'),
    });
  });

  it('explains a lost connection and retries with the same code', async () => {
    let fail = true;
    const { redeemGiftCode } = setup(async () => {
      if (fail) throw new FetchError(new TypeError('offline'));
      return { effectiveUntil: UNTIL, extended: false };
    });
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
    await submit();
    expect(document.activeElement).toBe(screen.getByText(copy.errors.network));

    fail = false;
    await submit();
    expect(redeemGiftCode).toHaveBeenCalledTimes(2);
    expect(redeemGiftCode.mock.calls[1][0].giftCodeRedeemRequest.code).toBe(
      'EIMIR-AB2C-D3EF',
    );
    expect(
      screen.getByRole('dialog', { name: copy.success.new.title }),
    ).toBeTruthy();
  });

  it('clears a shown problem once the code is edited', async () => {
    setup(async () => {
      throw problem(409, 'GIFT_CODE_USED');
    });
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EF' } });
    await submit();
    fireEvent.change(codeField(), { target: { value: 'EIMIR-AB2C-D3EG' } });
    expect(screen.queryByText(copy.errors.used)).toBeNull();
    expect(codeField().getAttribute('aria-describedby')).not.toContain('error');
  });
});
