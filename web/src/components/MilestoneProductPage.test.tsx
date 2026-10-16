// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import type { MilestoneDetail } from '../api/generated/models/MilestoneDetail';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import navigation from '../i18n/locales/navigation';
import storyProducts from '../i18n/locales/storyProducts';
import { AppShell } from './AppShell';
import { MilestoneProductPage } from './MilestoneProductPage';
import { QuickCreateMenu } from './QuickCreateMenu';

const backToStoryName = new RegExp(
  storyProducts.milestoneProduct.backToStory.replace(/^←\s*/, ''),
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
  vi.restoreAllMocks();
});

const milestone = {
  id: 'milestone-1',
  spaceId: 'space-1',
  title: 'First apartment together',
  body: null,
  happenedOn: new Date('2026-08-01T00:00:00Z'),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  version: 1,
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
    authorSummaryQueryKeys.milestone('space-1', 'milestone-1'),
    { value: milestone, source: 'network' },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/story/milestones/milestone-1',
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
                path="/story/milestones/:milestoneId"
                element={
                  <MilestoneProductPage
                    mode="detail"
                    apis={{} as ReferenceApis}
                    spaceId="space-1"
                    currentAccountId="account-1"
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
  const createMilestone = vi.fn().mockResolvedValue({ id: 'milestone-new' });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/story/milestones/new']}>
        <Routes>
          <Route
            path="/story/milestones/new"
            element={
              <MilestoneProductPage
                mode="create"
                apis={
                  {
                    milestones: { createMilestone },
                  } as unknown as ReferenceApis
                }
                spaceId="space-1"
                currentAccountId="account-1"
              />
            }
          />
          <Route
            path="/story/milestones/:milestoneId"
            element={<p>Milestone result</p>}
          />
          <Route path="/story" element={<p>Story fallback</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return createMilestone;
}

describe('Milestone create request identity', () => {
  it('sends an idempotency key with the submitted snapshot', async () => {
    const createMilestone = renderCreate();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(storyProducts.milestoneProduct.titleLabel),
      'Our first home',
    );
    await user.click(
      screen.getByRole('button', {
        name: storyProducts.milestoneProduct.save,
      }),
    );

    expect(createMilestone).toHaveBeenCalledWith({
      spaceId: 'space-1',
      idempotencyKey: expect.any(String),
      milestoneCreate: {
        title: 'Our first home',
        body: undefined,
        happenedOn: expect.any(Date),
      },
    });
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

describe('Quick Create Milestone continuity (#509)', () => {
  it('returns from a confirmed result to its originating context', async () => {
    const createMilestone = vi.fn().mockResolvedValue({ id: 'milestone-new' });
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
                path="/story/milestones/new"
                element={
                  <MilestoneProductPage
                    mode="create"
                    apis={
                      {
                        milestones: { createMilestone },
                      } as unknown as ReferenceApis
                    }
                    spaceId="space-1"
                    currentAccountId="account-1"
                  />
                }
              />
              <Route
                path="/story/milestones/:milestoneId"
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
      screen.getByRole('menuitem', { name: navigation.quickCreateMilestone }),
    );
    expect(document.activeElement).not.toBe(
      screen.getByLabelText(storyProducts.milestoneProduct.titleLabel),
    );
    await user.type(
      screen.getByLabelText(storyProducts.milestoneProduct.titleLabel),
      'Our first home',
    );
    await user.click(
      screen.getByRole('button', { name: storyProducts.milestoneProduct.save }),
    );
    await waitFor(() => expect(createMilestone).toHaveBeenCalledTimes(1));
    await user.click(
      await screen.findByRole('button', { name: 'Return to origin' }),
    );
    expect(await screen.findByText('Today origin')).toBeTruthy();
  });

  it('falls back to Story for direct create entry', async () => {
    renderCreate();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: backToStoryName }));
    expect(await screen.findByText('Story fallback')).toBeTruthy();
  });
});

describe('MilestoneProductPage Back restores origin (#966)', () => {
  it('falls back to the generic Story link when opened without a task origin', async () => {
    renderDetail();
    expect(
      await screen.findByRole('button', { name: backToStoryName }),
    ).toBeTruthy();
  });

  it('returns via the TaskOrigin contract instead of a static unconditional /story link', async () => {
    renderDetail('unresolvable-key');
    const back = await screen.findByRole('button', {
      name: backToStoryName,
    });
    const user = userEvent.setup();
    await user.click(back);
    expect(await screen.findByText('story landing')).toBeTruthy();
  });
});

describe('Milestone detail edit action (#1014)', () => {
  it('replaces the oversized text button with a compact icon-only edit link', async () => {
    renderDetail();
    const editLink = await screen.findByRole('link', {
      name: storyProducts.milestoneProduct.edit,
    });
    expect(editLink.getAttribute('href')).toBe(
      '/story/milestones/milestone-1/edit',
    );
    // Icon-only: the accessible name comes from aria-label, not visible text.
    expect(editLink.textContent?.trim()).toBe('');
    expect(editLink.className).not.toContain('button-link');
    expect(editLink.className).not.toContain('secondary-link');
  });
});

describe('Milestone/Memory detail hierarchy alignment (#1016)', () => {
  it('renders the detail card with the shared coffee-table surface treatment', async () => {
    const { container } = renderDetail();
    await screen.findByText('First apartment together');
    const card = container.querySelector('.product-detail-card');
    expect(card?.className).toContain('coffee-table-layout');
    expect(card?.querySelector('.memory-detail-body')).toBeTruthy();
  });
});

describe('Milestone view receipt', () => {
  it('emits a receipt strictly on successful presentation', async () => {
    const recordStoryViewMock = vi.fn().mockResolvedValue(undefined);
    let resolveQuery: (val: any) => void;
    let getMilestoneMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }),
    );
    const apis = {
      story: { recordStoryView: recordStoryViewMock },
      milestones: {
        getMilestone: (...args: any[]) => getMilestoneMock(...args),
      },
    } as unknown as ReferenceApis;

    const milestone: MilestoneDetail = {
      id: 'milestone-1',
      spaceId: 'space-1',
      authorId: 'account-1',
      author: { id: 'account-1', displayName: 'Alex' },
      title: 'First apartment together',
      body: '',
      happenedOn: new Date('2025-09-15'),
      createdAt: new Date('2025-09-15'),
      updatedAt: new Date('2025-09-15'),
      version: 1,
      capabilities: { canEdit: false, canDelete: false, canComment: false },
    };

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
        <MemoryRouter initialEntries={['/story/milestones/milestone-1']}>
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
                  path="/story/milestones/:milestoneId"
                  element={
                    <MilestoneProductPage
                      mode="detail"
                      apis={apis}
                      spaceId="space-1"
                      currentAccountId="account-1"
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

    // Now resolve the query
    resolveQuery!(milestone);

    expect(await screen.findByText('First apartment together')).toBeTruthy();

    expect(recordStoryViewMock).toHaveBeenCalledTimes(1);
    expect(recordStoryViewMock).toHaveBeenCalledWith({
      spaceId: 'space-1',
      storyViewReceipt: { kind: 'MILESTONE', itemId: 'milestone-1' },
    });
  });
});
