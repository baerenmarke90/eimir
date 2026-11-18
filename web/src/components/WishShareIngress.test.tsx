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
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  peek: vi.fn(),
  read: vi.fn(),
  discard: vi.fn(),
  share: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => plugin,
  Capacitor: {
    isNativePlatform: () => true,
    convertFileSrc: (uri: string) => uri,
  },
}));

import type { WishDetail } from '../api/generated/models/WishDetail';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import {
  type SharedWishNavigationState,
  takeSharedWishDraft,
} from '../client/sharedWishDraft';
import wishShare from '../i18n/locales/wishShare';
import { WishShareIngress } from './WishShareIngress';

const SCOPE = '["https://api.example","account-1","space-1"]';
const URI = 'content://de.eimir.app.selectedmedia/12345678-abcd';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  plugin.addListener.mockResolvedValue({ remove: vi.fn() });
  plugin.discard.mockResolvedValue(undefined);
  plugin.peek.mockResolvedValue({
    available: true,
    failed: false,
    generation: 'g1',
    text: 'This tent would be great\nhttps://www.shop.example/zelt',
    hasImage: true,
    imageCount: 1,
  });
  plugin.read.mockResolvedValue({ uri: URI, mimeType: 'image/jpeg' });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const mock of Object.values(plugin)) mock.mockReset();
});

function wish(id: string, title: string, updatedAt: string): WishDetail {
  return { id, title, updatedAt: new Date(updatedAt) } as WishDetail;
}

function Where() {
  const location = useLocation();
  return (
    <output data-testid="where">
      {location.pathname}
      {'|'}
      {JSON.stringify(location.state)}
    </output>
  );
}

function setup(path = '/plan', items: WishDetail[] = []) {
  const listWishes = vi.fn(async () => ({
    items,
    nextCursor: null as string | null,
    hasMore: false,
  }));
  const apis = { wishes: { listWishes } } as unknown as SharedPlanningApis;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <WishShareIngress scope={SCOPE} apis={apis} spaceId="space-1" />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { listWishes };
}

function destination() {
  const [pathname, state] = (
    screen.getByTestId('where').textContent ?? ''
  ).split('|');
  return { pathname, state: JSON.parse(state) as SharedWishNavigationState };
}

it('previews the shared link host and photo without fetching the photo', async () => {
  setup();
  const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
  expect(
    within(dialog).getByText(
      wishShare.linkFrom.replace('{{host}}', 'shop.example'),
    ),
  ).toBeTruthy();
  expect(within(dialog).getByText(wishShare.photo_one)).toBeTruthy();
  expect(within(dialog).getByText('This tent would be great')).toBeTruthy();
  expect(plugin.read).not.toHaveBeenCalled();
});

it('stages a draft and opens the empty editor for a new wish', async () => {
  setup();
  fireEvent.click(await screen.findByText(wishShare.saveAsWish));
  await waitFor(() => expect(destination().pathname).toBe('/plan/wishes/new'));
  const { state } = destination();
  expect(state.wishShareMode).toBe('create');
  const draft = takeSharedWishDraft(SCOPE, state.wishShareKey);
  expect(draft?.title).toBe('This tent would be great');
  expect(draft?.linkUrl).toBe('https://www.shop.example/zelt');
  expect(draft?.photo?.name).toBe('shared-photo.jpg');
  expect(plugin.discard).toHaveBeenCalledWith({ generation: 'g1' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('keeps the text usable when the photo cannot be read', async () => {
  plugin.read.mockRejectedValue(new Error('expired'));
  setup();
  fireEvent.click(await screen.findByText(wishShare.saveAsWish));
  expect((await screen.findByRole('alert')).textContent).toBe(
    wishShare.photoFailed,
  );
  expect(destination().pathname).toBe('/plan');
  fireEvent.click(screen.getByText(wishShare.saveAsWish));
  await waitFor(() => expect(destination().pathname).toBe('/plan/wishes/new'));
  const draft = takeSharedWishDraft(SCOPE, destination().state.wishShareKey);
  expect(draft?.photo).toBeUndefined();
  expect(draft?.linkUrl).toBe('https://www.shop.example/zelt');
});

it('lists open wishes, most recently changed first, to add to one', async () => {
  const { listWishes } = setup('/plan', [
    wish('old', 'Old idea', '2026-01-01T00:00:00Z'),
    wish('wish-fresh', 'Fresh idea', '2026-11-01T00:00:00Z'),
  ]);
  fireEvent.click(await screen.findByText(wishShare.addToWish));
  const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
  await within(dialog).findByText('Fresh idea');
  expect(listWishes).toHaveBeenCalledWith(
    expect.objectContaining({ spaceId: 'space-1', status: 'OPEN' }),
    expect.anything(),
  );
  const titles = within(dialog)
    .getAllByRole('button')
    .map((button) => button.querySelector('strong')?.textContent)
    .filter(Boolean);
  expect(titles).toEqual(['Fresh idea', 'Old idea']);
  fireEvent.click(within(dialog).getByText('Fresh idea'));
  await waitFor(() =>
    expect(destination().pathname).toBe('/plan/wishes/wish-fresh'),
  );
  expect(destination().state.wishShareMode).toBe('add');
}, 10_000);

it('shows an empty state when there is no open wish', async () => {
  setup('/plan', []);
  fireEvent.click(await screen.findByText(wishShare.addToWish));
  expect(await screen.findByText(wishShare.pickEmptyTitle)).toBeTruthy();
});

it('discards the lease on dismiss', async () => {
  setup();
  fireEvent.click(await screen.findByText(wishShare.dismiss));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(plugin.discard).toHaveBeenCalledWith({ generation: 'g1' });
});

it('defers while an editor is open', async () => {
  setup('/plan/wishes/new');
  expect(await screen.findByText(wishShare.finishEditingFirst)).toBeTruthy();
  expect(screen.queryByText(wishShare.saveAsWish)).toBeNull();
  expect(plugin.read).not.toHaveBeenCalled();
});

it('keeps a text-only share usable when the lease failed', async () => {
  plugin.peek.mockResolvedValue({
    available: true,
    failed: true,
    generation: 'g2',
    text: 'https://shop.example/zelt',
    hasImage: false,
    imageCount: 0,
  });
  setup();
  fireEvent.click(await screen.findByText(wishShare.saveAsWish));
  await waitFor(() => expect(destination().pathname).toBe('/plan/wishes/new'));
  const draft = takeSharedWishDraft(SCOPE, destination().state.wishShareKey);
  expect(draft?.title).toBeUndefined();
  expect(draft?.linkUrl).toBe('https://shop.example/zelt');
  expect(plugin.read).not.toHaveBeenCalled();
});
