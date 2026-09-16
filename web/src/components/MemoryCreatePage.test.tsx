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
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { TaskOriginProvider } from '../client/taskOrigin';
import de from '../i18n/locales/de';
import taskBoundary from '../i18n/locales/taskBoundary';
import { MemoryCreatePage } from './MemoryCreatePage';

const fixture = vi.hoisted(() => ({ create: vi.fn(), clear: vi.fn() }));
vi.mock('../client/referenceFlow', async (original) => ({
  ...(await original<typeof import('../client/referenceFlow')>()),
  createReferenceApis: () => ({ memories: { createMemory: fixture.create } }),
}));
vi.mock('../client/useAttachmentDrafts', () => ({
  useAttachmentDrafts: () => ({
    items: [],
    readyIds: [],
    hasPending: false,
    clear: fixture.clear,
  }),
}));
// Isolate mutation/session ownership; real history/dialog behavior has separate browser evidence.
vi.mock('../client/useEditorHistoryEntry', () => ({
  useEditorHistoryEntry: ({ onClose }: { onClose: () => void }) => onClose,
}));
const confirmed = {
  id: 'saved-memory',
  title: 'Our evening',
  body: 'Quiet words',
  version: 1,
  attachments: [],
} as unknown as MemoryDetail;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Harness({
  client,
  account = 'account-1',
  onSaved,
}: {
  client: QueryClient;
  account?: string;
  onSaved: () => Promise<void>;
}) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/story/memories/new']}>
        <TaskOriginProvider key={account} accountId={account} spaceId="space-1">
          <Routes>
            <Route
              path="/story/memories/new"
              element={
                <MemoryCreatePage
                  key={account}
                  accessToken="test-token"
                  apiBaseUrl="http://api.example.test"
                  spaceId="space-1"
                  accountId={account}
                  onSaved={onSaved}
                />
              }
            />
            <Route
              path="/story/memories/:id"
              element={<h1>Actual result destination</h1>}
            />
          </Routes>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
function setup(onSaved = vi.fn().mockResolvedValue(undefined)) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    onSaved,
    ...render(<Harness client={client} onSaved={onSaved} />),
  };
}
const titleInput = () =>
  screen.getByLabelText(de.memory.titleLabelOptional) as HTMLInputElement;
function enterTitle(value = 'Our evening') {
  fireEvent.change(titleInput(), { target: { value } });
}
function submit() {
  const form = document.querySelector('form');
  if (!form) throw new Error('Memory form is missing');
  fireEvent.submit(form);
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});
afterEach(cleanup);

describe('Memory capture mutation ownership', () => {
  it('locks duplicate submission and opens the confirmed result despite failed projection invalidation', async () => {
    const response = deferred<MemoryDetail>();
    fixture.create.mockReturnValue(response.promise);
    const onSaved = vi.fn().mockRejectedValue(new Error('Refresh unavailable'));
    const { client } = setup(onSaved);
    enterTitle();
    submit();
    submit();
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(titleInput().closest('fieldset')?.disabled).toBe(true);
    expect(screen.getByText(taskBoundary.pending)).toBeTruthy();
    expect(screen.queryByText('Actual result destination')).toBeNull();
    await act(async () => response.resolve(confirmed));
    expect(await screen.findByText('Actual result destination')).toBeTruthy();
    expect(
      client.getQueryData(
        authorSummaryQueryKeys.memory('space-1', confirmed.id),
      ),
    ).toEqual({ value: confirmed, source: 'network' });
    expect(fixture.clear).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
  it('reports a local date error without locking or sending, then saves after correction', async () => {
    fixture.create.mockResolvedValue(confirmed);
    setup();
    enterTitle();
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(de.memory.dateLabel) }),
    );
    const date = screen.getByLabelText(de.memory.dateLabel) as HTMLInputElement;
    fireEvent.change(date, { target: { value: '10000-01-01' } });
    submit();
    expect(screen.getByText(taskBoundary.invalidDate)).toBeTruthy();
    expect(date.getAttribute('aria-invalid')).toBe('true');
    expect(date.closest('fieldset')?.disabled).toBe(false);
    expect(document.activeElement).toBe(date);
    expect(fixture.create).not.toHaveBeenCalled();
    expect(screen.queryByText(taskBoundary.uncertainTitle)).toBeNull();
    expect(screen.queryByText(taskBoundary.pending)).toBeNull();
    fireEvent.change(date, { target: { value: '2026-09-15' } });
    submit();
    expect(await screen.findByText('Actual result destination')).toBeTruthy();
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });
  it('retains a definitively rejected draft and permits deliberate retry', async () => {
    fixture.create
      .mockRejectedValueOnce({ status: 422 })
      .mockResolvedValueOnce(confirmed);
    setup();
    enterTitle();
    submit();
    await waitFor(() =>
      expect(titleInput().closest('fieldset')?.disabled).toBe(false),
    );
    expect(titleInput().value).toBe('Our evening');
    expect(fixture.clear).not.toHaveBeenCalled();
    submit();
    expect(await screen.findByText('Actual result destination')).toBeTruthy();
    expect(fixture.create).toHaveBeenCalledTimes(2);
  });
  it('retains uncertain work without repeating POST after a lost response', async () => {
    fixture.create.mockRejectedValue(new Error('Response lost'));
    setup();
    enterTitle();
    submit();
    expect(await screen.findByText(taskBoundary.uncertainTitle)).toBeTruthy();
    expect(titleInput().value).toBe('Our evening');
    submit();
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.clear).not.toHaveBeenCalled();
    expect(screen.getByText(taskBoundary.checkMoments)).toBeTruthy();
  });
  it('does not send an offline write and permits deliberate retry after reconnecting', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    fixture.create.mockResolvedValue(confirmed);
    setup();
    enterTitle();
    submit();
    expect(screen.getByText(taskBoundary.offline)).toBeTruthy();
    expect(fixture.create).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    submit();
    expect(await screen.findByText('Actual result destination')).toBeTruthy();
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });
  it('ignores a late response after replacement by another account task', async () => {
    const response = deferred<MemoryDetail>();
    fixture.create.mockReturnValue(response.promise);
    const { client, onSaved, rerender } = setup();
    enterTitle('First account draft');
    submit();
    rerender(<Harness client={client} account="account-2" onSaved={onSaved} />);
    enterTitle('Second account draft');
    await act(async () => response.resolve(confirmed));
    expect(titleInput().value).toBe('Second account draft');
    expect(screen.queryByText('Actual result destination')).toBeNull();
    expect(
      client.getQueryData(
        authorSummaryQueryKeys.memory('space-1', confirmed.id),
      ),
    ).toBeUndefined();
    expect(fixture.clear).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('protects unload only when there is work to lose', () => {
    setup();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    enterTitle();
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
