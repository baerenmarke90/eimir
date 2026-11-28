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
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminProApi } from '../api/generated/apis/ServerAdminProApi';
import type { GiftCodeBatchView } from '../api/generated/models/GiftCodeBatchView';
import { resolvedLocale } from '../i18n';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminGiftCodeBatchSheet } from './ServerAdminGiftCodeBatchSheet';
import { Snackbar } from './Snackbar';
import { sectionHref } from './serverAdminAreas';
import germanUi from '../i18n/locales/de';

const copy = serverAdmin.pro.batch;
const BATCH_ID = '019b2e1a-7c3d-7f00-8a11-0000000000b1';
const SPACE_ID = '019b2e1a-7c3d-7f00-8a11-00000000000a';
const REDEEMED_AT = new Date('2026-11-24T10:00:00Z');

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) =>
      text.replace(new RegExp(`{{${key}(, number)?}}`, 'g'), String(value)),
    template,
  );
}

function batch(overrides: Partial<GiftCodeBatchView> = {}): GiftCodeBatchView {
  return {
    id: BATCH_ID,
    createdAt: new Date('2026-11-20T10:00:00Z'),
    durationMonths: 3,
    note: 'Beta friends',
    redeemableUntil: new Date('2027-11-20T22:59:59Z'),
    total: 4,
    open: 2,
    handedOut: 1,
    redeemed: 1,
    revoked: 0,
    expired: 0,
    revokedAt: null,
    codes: [
      {
        id: 'c1',
        code: 'EIMIR-AAAA-BBBB',
        state: 'open',
        handedOutAt: null,
        redeemedAt: null,
        redeemedSpaceId: null,
      },
      {
        id: 'c2',
        code: 'EIMIR-CCCC-DDDD',
        state: 'handed_out',
        handedOutAt: new Date('2026-11-21T10:00:00Z'),
        redeemedAt: null,
        redeemedSpaceId: null,
      },
      {
        id: 'c3',
        code: 'EIMIR-EEEE-FFFF',
        state: 'redeemed',
        handedOutAt: new Date('2026-11-21T10:00:00Z'),
        redeemedAt: REDEEMED_AT,
        redeemedSpaceId: SPACE_ID,
      },
      {
        id: 'c4',
        code: 'EIMIR-GGGG-HHHH',
        state: 'open',
        handedOutAt: null,
        redeemedAt: null,
        redeemedSpaceId: null,
      },
    ],
    ...overrides,
  };
}

function renderSheet(data: GiftCodeBatchView = batch()) {
  const api = {
    getGiftCodeBatch: vi.fn().mockResolvedValue(data),
    setGiftCodeHandedOut: vi.fn().mockResolvedValue(data),
    revokeGiftCodeBatch: vi.fn().mockResolvedValue({
      ...data,
      revokedAt: new Date(),
    }),
  };
  const onClose = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ServerAdminGiftCodeBatchSheet
          api={api as unknown as ServerAdminProApi}
          batchId={BATCH_ID}
          onClose={onClose}
        />
        <Snackbar />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { api, onClose };
}

const writeText = vi.fn();

describe('ServerAdminGiftCodeBatchSheet', () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => cleanup());

  it('copies one code and confirms it with the snackbar', async () => {
    renderSheet();

    const row = (await screen.findByText('EIMIR-AAAA-BBBB')).closest('li');
    if (!row) throw new Error('code row missing');
    fireEvent.click(within(row).getByRole('button', { name: copy.copy }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('EIMIR-AAAA-BBBB'),
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      copy.copied,
    );
  });

  it('copies all open codes one per line', async () => {
    renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: copy.copyAll }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'EIMIR-AAAA-BBBB\nEIMIR-GGGG-HHHH',
      ),
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      fill(copy.copiedAll_other, { count: 2 }),
    );
  });

  it('tells the operator when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    renderSheet();

    const row = (await screen.findByText('EIMIR-AAAA-BBBB')).closest('li');
    if (!row) throw new Error('code row missing');
    fireEvent.click(within(row).getByRole('button', { name: copy.copy }));

    expect((await screen.findByRole('status')).textContent).toContain(
      copy.copyFailed,
    );
  });

  it('toggles the handed-out mark', async () => {
    const { api } = renderSheet();

    const open = (await screen.findByText('EIMIR-AAAA-BBBB')).closest('li');
    const handed = screen.getByText('EIMIR-CCCC-DDDD').closest('li');
    if (!open || !handed) throw new Error('code rows missing');
    const openToggle = within(open).getByRole('button', {
      name: copy.handedOut,
    });
    const handedToggle = within(handed).getByRole('button', {
      name: copy.handedOut,
    });
    expect(openToggle.getAttribute('aria-pressed')).toBe('false');
    expect(handedToggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(openToggle);
    await waitFor(() =>
      expect(api.setGiftCodeHandedOut).toHaveBeenCalledWith({
        codeId: 'c1',
        giftCodeHandedOutUpdate: { handedOut: true },
      }),
    );
    fireEvent.click(handedToggle);
    await waitFor(() =>
      expect(api.setGiftCodeHandedOut).toHaveBeenCalledWith({
        codeId: 'c2',
        giftCodeHandedOutUpdate: { handedOut: false },
      }),
    );
  });

  it('shows the redemption date and links the Space file', async () => {
    renderSheet();

    const row = (await screen.findByText('EIMIR-EEEE-FFFF')).closest('li');
    if (!row) throw new Error('code row missing');
    const date = new Intl.DateTimeFormat(resolvedLocale(), {
      dateStyle: 'medium',
    }).format(REDEEMED_AT);
    expect(row.textContent).toContain(fill(copy.redeemedOn, { date }));
    expect(within(row).getByRole('link').getAttribute('href')).toBe(
      sectionHref('spaces', { space: SPACE_ID }),
    );
    expect(within(row).queryByRole('button', { name: copy.copy })).toBeNull();
  });

  it('asks before revoking the open codes', async () => {
    const { api } = renderSheet();

    fireEvent.click(
      await screen.findByRole('button', { name: copy.revokeOpen }),
    );
    expect(screen.getByText(copy.revokeConfirm)).toBeTruthy();
    expect(api.revokeGiftCodeBatch).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: germanUi.common.cancel }),
    );
    expect(screen.queryByText(copy.revokeConfirm)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: copy.revokeOpen }));
    fireEvent.click(
      screen.getByRole('button', { name: copy.revokeConfirmAction }),
    );
    await waitFor(() =>
      expect(api.revokeGiftCodeBatch).toHaveBeenCalledWith({
        batchId: BATCH_ID,
      }),
    );
  });

  it('offers nothing to revoke or copy on a revoked batch', async () => {
    renderSheet(
      batch({
        revokedAt: new Date('2026-11-25T10:00:00Z'),
        open: 0,
        handedOut: 0,
        revoked: 3,
        codes: batch().codes.map((code) =>
          code.state === 'redeemed' ? code : { ...code, state: 'revoked' },
        ),
      }),
    );

    expect((await screen.findAllByText(copy.revoked)).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole('button', { name: copy.revokeOpen })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.copyAll })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.copy })).toBeNull();
  });
});
