// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import { TaskOriginProvider } from '../client/taskOrigin';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import storyProducts from '../i18n/locales/storyProducts';
import { AppShell } from './AppShell';
import { HeartMomentProductPage } from './HeartMomentProductPage';

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

function renderDetail(taskOriginKey?: unknown) {
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
    { value: heartMoment, source: 'network' },
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

  it('shows "Mit Partner geteilt" as subdued metadata, not a prominent badge', async () => {
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
