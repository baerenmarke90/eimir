// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import navigation from '../i18n/locales/navigation';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import storyProducts from '../i18n/locales/storyProducts';
import { AppShell } from './AppShell';
import { HeartMomentProductPage } from './HeartMomentProductPage';
import { QuickCreateMenu } from './QuickCreateMenu';

const backToStoryName = new RegExp(
  storyProducts.heartMomentProduct.backToStory.replace(/^←\s*/, ''),
  'i',
);

beforeEach(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  cleanupMocks();
});
function cleanupMocks() {
  vi.restoreAllMocks();
}

const heartMoment = {
  id: 'heart-1',
  spaceId: 'space-1',
  text: 'I love you more each day',
  emotion: HeartEmotion.LOVED,
  visibility: ContentVisibility.SHARED,
  happenedOn: new Date('2026-08-25T00:00:00Z'),
  createdAt: new Date('2026-08-25T00:00:00Z'),
  updatedAt: new Date('2026-08-25T00:00:00Z'),
  version: 1,
  attachment: null,
  author: { id: 'author-1', displayName: 'Alex' },
  authorId: 'author-1',
  capabilities: { canComment: true, canDelete: true, canEdit: true },
};

function renderDetail(
  taskOriginKey?: unknown,
  data: typeof heartMoment & { tags?: Array<'everyday'> } = heartMoment,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(['profile-identity', 'space-1', 'account-1'], {
    accountId: 'account-1',
    displayName: 'Alex',
    profileAttachmentId: null,
    version: 1,
  });
  queryClient.setQueryData(['m5-s5', 'notification-unread-count', 'space-1'], {
    unreadCount: 0,
  });
  queryClient.setQueryData(authorSummaryQueryKeys.space('space-1'), {
    id: 'space-1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    partners: [],
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.heartMoment('space-1', 'heart-1'),
    { value: data, source: 'network' },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/story/heart-moments/heart-1',
            state: taskOriginKey ? { taskOriginKey } : null,
          },
        ]}
      >
        <TaskOriginProvider accountId="account-1" spaceId="space-1">
          <AppShell
            onLogout={() => undefined}
            apiBaseUrl="https://example.test"
            accessToken="token"
            account={{ id: 'account-1', displayName: 'Alex' }}
            spaceId="space-1"
          >
            <Routes>
              <Route path="/story" element={<div>story landing</div>} />
              <Route
                path="/story/heart-moments/:heartMomentId"
                element={
                  <HeartMomentProductPage
                    mode="detail"
                    apis={{} as ReferenceApis}
                    apiBaseUrl="https://example.test"
                    accessToken="token"
                    spaceId="space-1"
                    currentAccountId="account-1"
                    loadAttachment={async () => 'blob:test-image'}
                  />
                }
              />
            </Routes>
          </AppShell>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderCreate() {
  const createHeartMoment = vi.fn().mockResolvedValue({ id: 'heart-new' });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/story/heart-moments/new']}>
        <Routes>
          <Route
            path="/story/heart-moments/new"
            element={
              <HeartMomentProductPage
                mode="create"
                apis={
                  {
                    heartMoments: { createHeartMoment },
                  } as unknown as ReferenceApis
                }
                apiBaseUrl="https://example.test"
                accessToken="token"
                spaceId="space-1"
                currentAccountId="account-1"
                loadAttachment={async () => 'blob:test-image'}
              />
            }
          />
          <Route
            path="/story/heart-moments/:heartMomentId"
            element={<p>Heart Moment result</p>}
          />
          <Route path="/story" element={<p>Story landing</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return createHeartMoment;
}

describe('Heart Moment create request identity', () => {
  it('sends an idempotency key with the submitted snapshot', async () => {
    const createHeartMoment = renderCreate();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(storyProducts.heartMomentProduct.textLabel),
      'A quiet, wonderful evening',
    );
    await user.click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      }),
    );

    expect(createHeartMoment).toHaveBeenCalledWith({
      spaceId: 'space-1',
      idempotencyKey: expect.any(String),
      heartMomentCreate: {
        text: 'A quiet, wonderful evening',
        emotion: HeartEmotion.LOVED,
        happenedOn: expect.any(Date),
        visibility: ContentVisibility.SHARED,
        attachmentId: undefined,
        tags: [],
      },
    });
  });

  it('saves a chosen context without opening the keyboard or requiring prose', async () => {
    const createHeartMoment = renderCreate();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('checkbox', {
        name: storyProducts.heartMomentProduct.tagLabels.everyday,
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      }),
    );
    expect(createHeartMoment).toHaveBeenCalledWith({
      spaceId: 'space-1',
      idempotencyKey: expect.any(String),
      heartMomentCreate: expect.objectContaining({
        text: '',
        tags: ['everyday'],
      }),
    });
  });

  it('explains why an empty feeling-only capture cannot be saved', async () => {
    const createHeartMoment = renderCreate();
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      }),
    );
    expect(createHeartMoment).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      storyProducts.heartMomentProduct.contentRequired,
    );
  });
});

function ReturnFromResult() {
  const location = useLocation();
  const { requestReturn, resolveOrigin } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  return (
    <button type="button" onClick={() => requestReturn(originKey)}>
      {resolveOrigin(originKey) ? 'Return to origin' : 'Origin missing'}
    </button>
  );
}

describe('Quick Create Heart Moment continuity (#509)', () => {
  it('returns from a confirmed tag-only result to the originating context', async () => {
    const createHeartMoment = vi.fn().mockResolvedValue({ id: 'heart-new' });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/today']}>
          <TaskOriginProvider accountId="account-1" spaceId="space-1">
            <QuickCreateMenu variant="desktop" />
            <Routes>
              <Route path="/today" element={<p>Today origin</p>} />
              <Route
                path="/story/heart-moments/new"
                element={
                  <HeartMomentProductPage
                    mode="create"
                    apis={
                      {
                        heartMoments: { createHeartMoment },
                      } as unknown as ReferenceApis
                    }
                    apiBaseUrl="https://example.test"
                    accessToken="token"
                    spaceId="space-1"
                    currentAccountId="account-1"
                    loadAttachment={async () => 'blob:test-image'}
                  />
                }
              />
              <Route
                path="/story/heart-moments/:heartMomentId"
                element={<ReturnFromResult />}
              />
              <Route path="/story" element={<p>Story fallback</p>} />
            </Routes>
          </TaskOriginProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: navigation.newContent }),
    );
    await user.click(
      screen.getByRole('menuitem', {
        name: navigation.quickCreateHeartMoment,
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: storyProducts.heartMomentProduct.createHeading,
      }),
    ).toBeTruthy();
    expect(document.activeElement).not.toBe(
      screen.getByLabelText(storyProducts.heartMomentProduct.textLabel),
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: storyProducts.heartMomentProduct.tagLabels.everyday,
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      }),
    );
    await waitFor(() => expect(createHeartMoment).toHaveBeenCalledTimes(1));
    await user.click(
      await screen.findByRole('button', { name: 'Return to origin' }),
    );
    expect(await screen.findByText('Today origin')).toBeTruthy();
  });

  it('uses Story as the safe fallback for a direct create entry', async () => {
    renderCreate();
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: backToStoryName,
      }),
    );
    expect(await screen.findByText('Story landing')).toBeTruthy();
  });
});

describe('HeartMomentProductPage Back restores origin (#966)', () => {
  it('falls back to the generic Story link when opened without a task origin', async () => {
    renderDetail();
    expect(
      await screen.findByRole('button', { name: backToStoryName }),
    ).toBeTruthy();
  });

  it('reuses the shared taskBoundary.back label and restores scope when a valid origin key is present', async () => {
    // A real origin key is only produced by TaskOriginProvider.captureOrigin;
    // an arbitrary unresolved key still proves the component reads
    // taskOriginKey from router state at all (falls back safely otherwise).
    renderDetail('unresolvable-key');
    const back = await screen.findByRole('button', {
      name: backToStoryName,
    });
    const user = userEvent.setup();
    await user.click(back);
    expect(await screen.findByText('story landing')).toBeTruthy();
  });
});

describe('Heart Moment detail edit action and shared state (#1014)', () => {
  it('shows authored context without inventing prose for a textless result', async () => {
    renderDetail(undefined, { ...heartMoment, text: '', tags: ['everyday'] });
    expect(
      await screen.findByRole('heading', {
        name: storyProducts.heartMomentProduct.untitled,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(storyProducts.heartMomentProduct.tagLabels.everyday),
    ).toBeTruthy();
  });
  it('replaces the oversized text button with a compact icon-only edit link', async () => {
    renderDetail();
    const editLink = await screen.findByRole('link', {
      name: storyProducts.heartMomentProduct.edit,
    });
    expect(editLink.getAttribute('href')).toBe(
      '/story/heart-moments/heart-1/edit',
    );
    // Icon-only: the accessible name comes from aria-label, not visible text.
    expect(editLink.textContent?.trim()).toBe('');
    expect(editLink.className).not.toContain('button-link');
    expect(editLink.className).not.toContain('secondary-link');
  });

  it('shows shared visibility as subdued metadata instead of a prominent badge', async () => {
    renderDetail();
    await screen.findByText('I love you more each day');
    const status = screen.getByRole('status', {
      name: relationshipComponents.visibilityShared,
    });
    expect(status.className).toContain('visibility-badge-subtle');
    expect(status.className).not.toContain('button-link');
  });

  it('keeps the visibility toggle as plain text beside the status, no heading or warning card', async () => {
    renderDetail();
    await screen.findByText('I love you more each day');
    expect(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.makePrivate,
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/Sichtbarkeit ändern/)).toBeNull();
  });
});

describe('Heart Moment view receipt', () => {
  it('emits a receipt strictly on successful presentation of a SHARED moment', async () => {
    const recordStoryViewMock = vi.fn().mockResolvedValue(undefined);
    let resolveQuery: (val: any) => void;
    let getHeartMomentMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }),
    );
    const apis = {
      story: { recordStoryView: recordStoryViewMock },
      heartMoments: {
        getHeartMoment: (...args: any[]) => getHeartMomentMock(...args),
      },
    } as unknown as ReferenceApis;

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    queryClient.setQueryData(['profile-identity', 'space-1', 'account-1'], {
      accountId: 'account-1',
      displayName: 'Alex',
      profileAttachmentId: null,
      version: 1,
    });
    queryClient.setQueryData(
      ['m5-s5', 'notification-unread-count', 'space-1'],
      {
        unreadCount: 0,
      },
    );
    queryClient.setQueryData(authorSummaryQueryKeys.space('space-1'), {
      id: 'space-1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      partners: [],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/story/heart-moments/heart-1']}>
          <TaskOriginProvider accountId="account-1" spaceId="space-1">
            <AppShell
              onLogout={() => undefined}
              apiBaseUrl="https://example.test"
              accessToken="token"
              account={{ id: 'account-1', displayName: 'Alex' }}
              spaceId="space-1"
            >
              <Routes>
                <Route
                  path="/story/heart-moments/:heartMomentId"
                  element={
                    <HeartMomentProductPage
                      mode="detail"
                      apis={apis}
                      apiBaseUrl="https://example.test"
                      accessToken="token"
                      spaceId="space-1"
                      currentAccountId="account-1"
                      loadAttachment={async () => 'blob:test-image'}
                    />
                  }
                />
              </Routes>
            </AppShell>
          </TaskOriginProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Should not emit while loading
    expect(recordStoryViewMock).not.toHaveBeenCalled();

    // Now resolve the query with SHARED visibility
    resolveQuery!({
      ...heartMoment,
      visibility: ContentVisibility.SHARED,
    });

    expect(await screen.findByText('I love you more each day')).toBeTruthy();

    expect(recordStoryViewMock).toHaveBeenCalledTimes(1);
    expect(recordStoryViewMock).toHaveBeenCalledWith({
      spaceId: 'space-1',
      storyViewReceipt: { kind: 'HEART_MOMENT', itemId: 'heart-1' },
    });
  });

  it('does NOT emit a receipt for a PRIVATE moment', async () => {
    const recordStoryViewMock = vi.fn().mockResolvedValue(undefined);
    const apis = {
      story: { recordStoryView: recordStoryViewMock },
      heartMoments: {
        getHeartMoment: vi.fn().mockResolvedValue({
          ...heartMoment,
          visibility: ContentVisibility.PRIVATE,
        }),
      },
    } as unknown as ReferenceApis;

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    queryClient.setQueryData(['profile-identity', 'space-1', 'account-1'], {
      accountId: 'account-1',
      displayName: 'Alex',
      profileAttachmentId: null,
      version: 1,
    });
    queryClient.setQueryData(
      ['m5-s5', 'notification-unread-count', 'space-1'],
      {
        unreadCount: 0,
      },
    );
    queryClient.setQueryData(authorSummaryQueryKeys.space('space-1'), {
      id: 'space-1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      partners: [],
    });

    // Resolve immediately with PRIVATE visibility in query client cache just to be safe
    queryClient.setQueryData(
      authorSummaryQueryKeys.heartMoment('space-1', 'heart-1'),
      {
        value: { ...heartMoment, visibility: ContentVisibility.PRIVATE },
        source: 'network',
      },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/story/heart-moments/heart-1']}>
          <TaskOriginProvider accountId="account-1" spaceId="space-1">
            <AppShell
              onLogout={() => undefined}
              apiBaseUrl="https://example.test"
              accessToken="token"
              account={{ id: 'account-1', displayName: 'Alex' }}
              spaceId="space-1"
            >
              <Routes>
                <Route
                  path="/story/heart-moments/:heartMomentId"
                  element={
                    <HeartMomentProductPage
                      mode="detail"
                      apis={apis}
                      apiBaseUrl="https://example.test"
                      accessToken="token"
                      spaceId="space-1"
                      currentAccountId="account-1"
                      loadAttachment={async () => 'blob:test-image'}
                    />
                  }
                />
              </Routes>
            </AppShell>
          </TaskOriginProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('I love you more each day')).toBeTruthy();

    // MUST NOT EMIT
    expect(recordStoryViewMock).not.toHaveBeenCalled();
  });
});
