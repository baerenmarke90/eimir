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
import {
  MEMORY_CREATE_RESULT_DELETED,
  RECONCILIATION_WINDOW_MS,
} from '../client/memoryCreateIdentity';
import { TaskOriginProvider } from '../client/taskOrigin';
import de from '../i18n/locales/de';
import taskBoundary from '../i18n/locales/taskBoundary';
import { MemoryCreatePage } from './MemoryCreatePage';

const fixture = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  replace: vi.fn(),
  clear: vi.fn(),
  readyIds: [] as string[],
}));
vi.mock('../client/referenceFlow', async (original) => ({
  ...(await original<typeof import('../client/referenceFlow')>()),
  createReferenceApis: () => ({
    memories: {
      createMemory: fixture.create,
      getMemory: fixture.get,
      replaceMemoryAttachments: fixture.replace,
    },
  }),
}));
vi.mock('../client/useAttachmentDrafts', () => ({
  useAttachmentDrafts: () => ({
    items: fixture.readyIds.map((id) => ({
      id,
      status: 'ready',
      file: new File(['x'], `${id}.jpg`, { type: 'image/jpeg' }),
      previewUrl: 'blob:preview',
    })),
    readyIds: fixture.readyIds,
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
  fixture.readyIds = [];
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const verifyButton = () =>
  screen.getByRole('button', { name: taskBoundary.verify });
const requestOf = (call: number) => fixture.create.mock.calls[call]?.[0];

describe('Memory capture mutation ownership', () => {
  it('keeps Save disabled and sends no request for a completely empty capture', () => {
    setup();
    const save = screen.getByRole('button', {
      name: de.memory.save,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    submit();
    expect(fixture.create).not.toHaveBeenCalled();
    enterTitle();
    expect(save.disabled).toBe(false);
  });
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
  it('sends one request identity and keeps it out of the visible UI', async () => {
    fixture.create.mockResolvedValue(confirmed);
    setup();
    enterTitle();
    submit();
    expect(await screen.findByText('Actual result destination')).toBeTruthy();
    expect(requestOf(0).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(document.body.textContent).not.toContain(
      requestOf(0).idempotencyKey,
    );
  });
  it('verifies an unknown outcome with the same identity and snapshot, then opens the one saved Memory', async () => {
    fixture.create
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce(confirmed);
    const { onSaved } = setup();
    enterTitle();
    submit();
    expect(await screen.findByText(taskBoundary.uncertainTitle)).toBeTruthy();
    // Nothing is replayed on its own: verification is an explicit action.
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.clear).not.toHaveBeenCalled();

    fireEvent.click(verifyButton());
    expect(await screen.findByText('Actual result destination')).toBeTruthy();

    expect(fixture.create).toHaveBeenCalledTimes(2);
    expect(requestOf(1).idempotencyKey).toBe(requestOf(0).idempotencyKey);
    expect(requestOf(1).memoryCreate).toBe(requestOf(0).memoryCreate);
    expect(fixture.clear).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
  it('announces the check without claiming success or failure and keeps the input read-only', async () => {
    const response = deferred<MemoryDetail>();
    fixture.create
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockReturnValueOnce(response.promise);
    setup();
    enterTitle();
    submit();
    await screen.findByText(taskBoundary.uncertainTitle);
    fireEvent.click(verifyButton());

    const status = await screen.findByRole('status');
    expect(status.textContent).toBe(taskBoundary.verifying);
    expect(titleInput().value).toBe('Our evening');
    expect(titleInput().closest('fieldset')?.disabled).toBe(true);
    expect(verifyButton().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(verifyButton());
    expect(fixture.create).toHaveBeenCalledTimes(2);
    await act(async () => response.resolve(confirmed));
    expect(await screen.findByText('Actual result destination')).toBeTruthy();
  });
  it('stays honest when verification is itself unanswered and never replaces the input', async () => {
    fixture.create.mockRejectedValue(new Error('Response lost'));
    setup();
    enterTitle();
    submit();
    await screen.findByText(taskBoundary.uncertainTitle);
    fireEvent.click(verifyButton());
    expect(
      await screen.findByText(taskBoundary.verifyUnavailable),
    ).toBeTruthy();
    expect(screen.getByText(taskBoundary.uncertainTitle)).toBeTruthy();
    expect(titleInput().value).toBe('Our evening');
    expect(screen.queryByText('Actual result destination')).toBeNull();
    fireEvent.click(verifyButton());
    await waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(3));
    expect(
      new Set(fixture.create.mock.calls.map(([r]) => r.idempotencyKey)).size,
    ).toBe(1);
  });
  it('does not send a verification request while offline', async () => {
    fixture.create.mockRejectedValue(new Error('Response lost'));
    setup();
    enterTitle();
    submit();
    await screen.findByText(taskBoundary.uncertainTitle);
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    fireEvent.click(verifyButton());
    expect(
      await screen.findByText(taskBoundary.verifyUnavailable),
    ).toBeTruthy();
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });
  it('states honestly that an identity older than the reconciliation window cannot be verified', async () => {
    fixture.create.mockRejectedValue(new Error('Response lost'));
    setup();
    enterTitle();
    submit();
    await screen.findByText(taskBoundary.uncertainTitle);
    const later = Date.now() + RECONCILIATION_WINDOW_MS + 60_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent.click(verifyButton());

    expect(
      await screen.findByText(taskBoundary.unverifiableTitle),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: taskBoundary.verify }),
    ).toBeNull();
    expect(screen.getByText(taskBoundary.checkMoments)).toBeTruthy();
    expect(titleInput().value).toBe('Our evening');
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });
  it('reports a confirmed-then-deleted Memory without recreating it and only then allows a fresh save', async () => {
    fixture.create
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockRejectedValueOnce({
        status: 404,
        code: MEMORY_CREATE_RESULT_DELETED,
      })
      .mockResolvedValueOnce(confirmed);
    setup();
    enterTitle();
    submit();
    await screen.findByText(taskBoundary.uncertainTitle);
    fireEvent.click(verifyButton());

    expect(await screen.findByText(taskBoundary.deletedTitle)).toBeTruthy();
    expect(titleInput().value).toBe('Our evening');
    expect(titleInput().closest('fieldset')?.disabled).toBe(false);
    expect(fixture.create).toHaveBeenCalledTimes(2);

    submit();
    expect(await screen.findByText('Actual result destination')).toBeTruthy();
    expect(fixture.create).toHaveBeenCalledTimes(3);
    expect(requestOf(2).idempotencyKey).not.toBe(requestOf(0).idempotencyKey);
  });
  it('uses a new identity for a deliberate retry after a definitive rejection', async () => {
    fixture.create
      .mockRejectedValueOnce({ status: 422 })
      .mockResolvedValueOnce(confirmed);
    setup();
    enterTitle();
    submit();
    await waitFor(() =>
      expect(titleInput().closest('fieldset')?.disabled).toBe(false),
    );
    enterTitle('Our evening, corrected');
    submit();
    expect(await screen.findByText('Actual result destination')).toBeTruthy();
    expect(requestOf(1).idempotencyKey).not.toBe(requestOf(0).idempotencyKey);
    expect(requestOf(1).memoryCreate.title).toBe('Our evening, corrected');
  });
  it('resumes photo association against the reconciled Memory without a second create', async () => {
    fixture.readyIds = ['photo-1'];
    const bound = { ...confirmed, version: 2 } as MemoryDetail;
    fixture.create
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce(confirmed);
    fixture.get.mockResolvedValue(confirmed);
    fixture.replace.mockResolvedValue(bound);
    setup();
    enterTitle();
    submit();
    await screen.findByText(taskBoundary.uncertainTitle);
    expect(fixture.replace).not.toHaveBeenCalled();

    fireEvent.click(verifyButton());
    expect(await screen.findByText('Actual result destination')).toBeTruthy();

    expect(requestOf(1).idempotencyKey).toBe(requestOf(0).idempotencyKey);
    expect(fixture.replace).toHaveBeenCalledTimes(1);
    expect(fixture.replace.mock.calls[0][0]).toMatchObject({
      memoryId: 'saved-memory',
      ifMatch: '1',
    });
    expect(fixture.create).toHaveBeenCalledTimes(2);
  });
  it('keeps the confirmed Memory when photo association fails after verification', async () => {
    fixture.readyIds = ['photo-1'];
    fixture.create
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce(confirmed);
    fixture.get.mockResolvedValue(confirmed);
    fixture.replace.mockRejectedValue({ status: 503 });
    setup();
    enterTitle();
    submit();
    await screen.findByText(taskBoundary.uncertainTitle);
    fireEvent.click(verifyButton());

    expect(await screen.findByText(taskBoundary.partialTitle)).toBeTruthy();
    expect(screen.queryByText(taskBoundary.uncertainTitle)).toBeNull();
    fireEvent.click(screen.getByText(taskBoundary.retryPhotos));
    await waitFor(() => expect(fixture.replace).toHaveBeenCalledTimes(2));
    expect(fixture.create).toHaveBeenCalledTimes(2);
  });
  it('ignores a late verification result after replacement by another account task', async () => {
    const response = deferred<MemoryDetail>();
    fixture.create
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockReturnValueOnce(response.promise);
    const { client, onSaved, rerender } = setup();
    enterTitle('First account draft');
    submit();
    await screen.findByText(taskBoundary.uncertainTitle);
    fireEvent.click(verifyButton());
    rerender(<Harness client={client} account="account-2" onSaved={onSaved} />);
    enterTitle('Second account draft');
    await act(async () => response.resolve(confirmed));

    expect(titleInput().value).toBe('Second account draft');
    expect(screen.queryByText('Actual result destination')).toBeNull();
    expect(fixture.clear).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
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
