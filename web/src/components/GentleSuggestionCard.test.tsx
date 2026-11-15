// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { GentleSuggestion } from '../api/generated/models/GentleSuggestion';
import copy from '../i18n/locales/gentlePrompts';
import { GentleSuggestionCard } from './GentleSuggestionCard';
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

function setup({
  consent = true,
  kind = 'WRITING',
  fail = false,
  featuredMemoryIds = [],
}: {
  consent?: boolean;
  kind?: 'WRITING' | 'MEMORY';
  fail?: boolean;
  featuredMemoryIds?: string[];
} = {}) {
  const item: GentleSuggestion = {
    id: 'occasion-1',
    kind,
    memoryId: kind === 'MEMORY' ? 'memory-1' : null,
    expiresAt: new Date(Date.now() + 3600_000),
    writingVariant: 0,
  };
  const api = {
    getGentleSuggestion: vi.fn(async () => item),
    openGentleSuggestion: vi.fn(async () => item),
    dismissGentleSuggestion: vi.fn(async () => undefined),
    excludeGentleMemory: vi.fn(async () => undefined),
  };
  if (fail)
    api.dismissGentleSuggestion.mockRejectedValue(new Error('Unavailable'));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/today']}>
        <Link to="/story/memories/new">Continue elsewhere</Link>
        <Routes>
          <Route
            path="/today"
            element={
              <GentleSuggestionCard
                account={{
                  id: 'owner',
                  displayName: 'Alex',
                  gentlePromptsEnabled: consent,
                }}
                spaceId="space"
                api={api as unknown as NotificationsApi}
                featuredMemoryIds={featuredMemoryIds}
              />
            }
          />
          <Route
            path="/story/memories/new"
            element={
              <textarea aria-label="Existing composer" defaultValue="" />
            }
          />
          <Route
            path="/story/memories/memory-1"
            element={<p>Authorized memory detail</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { api, item, client, ...rendered };
}

it('does not fetch or present optional suggestions without consent', () => {
  const { api } = setup({ consent: false });
  expect(api.getGentleSuggestion).not.toHaveBeenCalled();
  expect(screen.queryByText(copy.writingTitle)).toBeNull();
});

it('opens the existing blank writing composer without saving invitation text', async () => {
  const { api } = setup();
  fireEvent.click(await screen.findByRole('button', { name: copy.write }));
  const composer = await screen.findByRole('textbox', {
    name: 'Existing composer',
  });
  expect((composer as HTMLTextAreaElement).value).toBe('');
  expect(api.openGentleSuggestion).toHaveBeenCalledExactlyOnceWith({
    spaceId: 'space',
    occasionId: 'occasion-1',
  });
});

it('resolves the authorized Memory destination before navigation', async () => {
  const { api } = setup({ kind: 'MEMORY' });
  fireEvent.click(await screen.findByRole('button', { name: copy.rediscover }));
  await screen.findByText('Authorized memory detail');
  expect(api.openGentleSuggestion).toHaveBeenCalledOnce();
});

it('retains a failed dismissal and confirms only a successful dismissal', async () => {
  const { api } = setup({ fail: true });
  fireEvent.click(await screen.findByRole('button', { name: copy.dismiss }));
  await waitFor(() =>
    expect(api.dismissGentleSuggestion).toHaveBeenCalledOnce(),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: copy.dismiss })
        .hasAttribute('disabled'),
    ).toBe(false),
  );
  expect(screen.getByText(copy.writingTitle)).toBeDefined();
  api.dismissGentleSuggestion.mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole('button', { name: copy.dismiss }));
  const dismissed = await screen.findByText(copy.dismissed);
  expect(document.activeElement).toBe(dismissed);
  expect(screen.queryByText(copy.writingTitle)).toBeNull();
});

it('excludes a rediscovered Memory through a personal contextual sheet', async () => {
  const { api } = setup({ kind: 'MEMORY' });
  fireEvent.click(await screen.findByRole('button', { name: copy.actions }));
  await screen.findByRole('dialog', { name: copy.memoryTitle });
  expect(screen.getByText(copy.personalHint)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: copy.exclude }));
  const excluded = await screen.findByText(copy.excluded);
  expect(document.activeElement).toBe(excluded);
  expect(api.excludeGentleMemory).toHaveBeenCalledExactlyOnceWith({
    spaceId: 'space',
    memoryId: 'memory-1',
  });
});

it('suppresses a Memory already featured in the existing Wir composition', async () => {
  const { api } = setup({ kind: 'MEMORY', featuredMemoryIds: ['memory-1'] });
  await waitFor(() => expect(api.getGentleSuggestion).toHaveBeenCalledOnce());
  expect(screen.queryByText(copy.memoryTitle)).toBeNull();
});

it('does not replace another editor draft after its original surface unmounts', async () => {
  const { api, item } = setup({ kind: 'MEMORY' });
  let resolve: ((value: GentleSuggestion) => void) | undefined;
  api.openGentleSuggestion.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(await screen.findByRole('button', { name: copy.rediscover }));
  await waitFor(() => expect(api.openGentleSuggestion).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('link', { name: 'Continue elsewhere' }));
  const editor = await screen.findByRole('textbox', {
    name: 'Existing composer',
  });
  fireEvent.change(editor, {
    target: { value: 'A draft created after leaving Today' },
  });
  resolve?.(item);
  await waitFor(() =>
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Existing composer',
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('A draft created after leaving Today'),
  );
  expect(screen.queryByText('Authorized memory detail')).toBeNull();
});
