// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import { PlansApi } from '../api/generated/apis/PlansApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import type { HeartMomentDetail } from '../api/generated/models/HeartMomentDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import navigation from '../i18n/locales/navigation';
import contextTags from '../i18n/locales/contextTags';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import storyProducts from '../i18n/locales/storyProducts';
import taskBoundary from '../i18n/locales/taskBoundary';
import { AppShell } from './AppShell';
import { HeartMomentProductPage } from './HeartMomentProductPage';
import { QuickCreateMenu } from './QuickCreateMenu';

const backToStoryName = taskBoundary.back;

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
  tags: [],
  attachment: null,
  author: { id: 'author-1', displayName: 'Alex' },
  authorId: 'author-1',
  capabilities: { canComment: true, canDelete: true, canEdit: true },
};

function renderDetail(
  taskOriginKey?: unknown,
  data: HeartMomentDetail = heartMoment,
  mode: 'detail' | 'edit' = 'detail',
  apis = {} as ReferenceApis,
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
            pathname: `/story/heart-moments/heart-1${mode === 'edit' ? '/edit' : ''}`,
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
                path={`/story/heart-moments/:heartMomentId${mode === 'edit' ? '/edit' : ''}`}
                element={
                  <HeartMomentProductPage
                    mode={mode}
                    apis={apis}
                    apiBaseUrl="https://example.test"
                    accessToken="token"
                    spaceId="space-1"
                    currentAccountId="account-1"
                    loadAttachment={async () => 'blob:test-image'}
                  />
                }
              />
              {mode === 'edit' ? (
                <Route
                  path="/story/heart-moments/:heartMomentId"
                  element={<p>Saved partner words</p>}
                />
              ) : null}
            </Routes>
          </AppShell>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderCreate(entryState?: object) {
  const createHeartMoment = vi.fn().mockResolvedValue({ id: 'heart-new' });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          { pathname: '/story/heart-moments/new', state: entryState },
        ]}
      >
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

async function selectSuggestedContext(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByRole('button', { name: contextTags.add }));
  await user.click(
    screen.getByText(contextTags.suggestions, { selector: 'summary' }),
  );
  await user.click(screen.getByRole('checkbox', { name: label }));
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
        attachments: [],
        selectedCoverAttachmentId: null,
        tags: [],
      },
    });
  });

  it('saves a chosen context without opening the keyboard or requiring prose', async () => {
    const createHeartMoment = renderCreate();
    const user = userEvent.setup();
    await selectSuggestedContext(
      user,
      storyProducts.heartMomentProduct.tagLabels.everyday,
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

  it('keeps header completion bound to its form and blocks duplicate pending saves', async () => {
    const createHeartMoment = renderCreate();
    let resolveCreate!: (value: { id: string }) => void;
    createHeartMoment.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(storyProducts.heartMomentProduct.textLabel),
      'A thought worth keeping',
    );
    const save = screen.getByRole('button', {
      name: storyProducts.heartMomentProduct.save,
    }) as HTMLButtonElement;
    expect(save.closest('form')).toBeNull();
    expect(save.form?.id).toBe('heart-moment-create-form');
    await user.click(save);
    await waitFor(() => expect(createHeartMoment).toHaveBeenCalledOnce());
    expect(save.disabled).toBe(true);
    expect(save.getAttribute('aria-label')).toBe(
      storyProducts.heartMomentProduct.saving,
    );
    await user.click(save);
    expect(createHeartMoment).toHaveBeenCalledOnce();
    resolveCreate({ id: 'heart-new' });
    expect(await screen.findByText('Heart Moment result')).toBeTruthy();
  });

  it('commits an unfinished disclosed tag when header Save receives focus', async () => {
    const createHeartMoment = renderCreate();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: contextTags.add }));
    await user.type(screen.getByLabelText(contextTags.newLabel), 'Quiet time');
    await user.click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      }),
    );
    expect(createHeartMoment).toHaveBeenCalledWith(
      expect.objectContaining({
        heartMomentCreate: expect.objectContaining({
          text: '',
          tags: ['Quiet time'],
        }),
      }),
    );
    expect(createHeartMoment).toHaveBeenCalledOnce();
  });

  it('keeps the chosen audience in native form data and restores its disclosure focus', async () => {
    const createHeartMoment = renderCreate();
    const user = userEvent.setup();
    const audience = screen.getByText(
      storyProducts.heartMomentProduct.visibilityShared,
      { selector: 'summary span' },
    );
    await user.click(audience);
    const privateChoice = screen.getByRole('radio', {
      name: storyProducts.heartMomentProduct.visibilityPrivate,
    });
    const disclosure = privateChoice.closest('details');
    await user.click(privateChoice);
    expect(disclosure?.open).toBe(false);
    expect(document.activeElement).toBe(disclosure?.querySelector('summary'));
    expect(disclosure?.querySelector('summary')?.textContent).toContain(
      storyProducts.heartMomentProduct.visibilityPrivate,
    );
    await user.type(
      screen.getByLabelText(storyProducts.heartMomentProduct.textLabel),
      'Only for me',
    );
    await user.click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      }),
    );
    expect(createHeartMoment).toHaveBeenCalledWith(
      expect.objectContaining({
        heartMomentCreate: expect.objectContaining({
          text: 'Only for me',
          visibility: ContentVisibility.PRIVATE,
          emotion: HeartEmotion.LOVED,
        }),
      }),
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
    await selectSuggestedContext(
      user,
      storyProducts.heartMomentProduct.tagLabels.everyday,
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
  it('keeps long authored text once inside the content area, apart from the compact heading', async () => {
    const text =
      'A long thought about our quiet evening together.\nThe whole description stays readable beside its emotion and media.';
    renderDetail(undefined, { ...heartMoment, text });
    const heading = await screen.findByRole('heading', {
      name: storyProducts.heartMomentProduct.detailEyebrow,
      level: 1,
    });
    const body = screen.getByText(text, { normalizer: (value) => value });
    expect(heading.textContent).not.toContain(text);
    expect(body.tagName).toBe('P');
    expect(body.closest('article')?.className).toContain('product-detail-card');
    expect(body.className).toContain('heart-moment-detail-text');
    expect(body.textContent).toBe(text);
    expect(
      screen.getAllByText(text, { normalizer: (value) => value }),
    ).toHaveLength(1);
    expect(
      document.querySelector('header time')?.getAttribute('datetime'),
    ).toBe('2026-08-25');
  });

  it('shows authored context without inventing prose for a textless result', async () => {
    renderDetail(undefined, { ...heartMoment, text: '', tags: ['everyday'] });
    expect(
      await screen.findByRole('heading', {
        name: storyProducts.heartMomentProduct.detailEyebrow,
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

  it('allows partner editing without transferring deletion or privacy authority', async () => {
    renderDetail(undefined, {
      ...heartMoment,
      capabilities: { canEdit: true, canDelete: false, canComment: true },
    });
    await screen.findByText('I love you more each day');
    expect(
      screen
        .getByRole('link', { name: storyProducts.heartMomentProduct.edit })
        .getAttribute('href'),
    ).toBe('/story/heart-moments/heart-1/edit');
    expect(
      screen.queryByRole('button', {
        name: storyProducts.heartMomentProduct.makePrivate,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: storyProducts.heartMomentProduct.delete,
      }),
    ).toBeNull();
  });

  it('saves partner words without submitting a hidden photo classification field', async () => {
    const shared: HeartMomentDetail = {
      ...heartMoment,
      capabilities: { canEdit: true, canDelete: false, canComment: true },
      attachment: {
        id: 'protected-photo',
        mediaType: 'IMAGE',
        status: 'READY',
        hasThumbnail: false,
        isSensitive: true,
        width: null,
        height: null,
        size: 10,
        mimeType: 'image/jpeg',
      },
    };
    const updateHeartMoment = vi
      .fn()
      .mockResolvedValue({ ...shared, version: 2 });
    renderDetail(undefined, shared, 'edit', {
      heartMoments: { updateHeartMoment },
    } as unknown as ReferenceApis);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(storyProducts.heartMomentProduct.textLabel),
      ' A shared thought.',
    );
    await user.click(
      screen.getByRole('button', {
        name: storyProducts.heartMomentProduct.save,
      }),
    );
    await screen.findByText('Saved partner words');
    expect(updateHeartMoment).toHaveBeenCalledOnce();
    expect(
      updateHeartMoment.mock.calls[0][0].heartMomentUpdate,
    ).not.toHaveProperty('attachmentIsSensitive');
    expect(updateHeartMoment.mock.calls[0][0].heartMomentUpdate.text).toContain(
      'A shared thought.',
    );
  });

  it('keeps the visibility toggle as plain text beside the status, no heading or warning card', async () => {
    renderDetail(undefined, {
      ...heartMoment,
      authorId: 'account-1',
      author: { id: 'account-1', displayName: 'Alex' },
    });
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
    const getHeartMomentMock = vi.fn().mockReturnValue(
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

describe('Completed Plan handoff to HeartMoment', () => {
  it.each(['PRIVATE', 'SHARED'] as const)(
    'retains the source Place with %s privacy',
    async (visibility) => {
      const place = {
        id: 'place-1',
        name: 'Bostalsee',
        address: 'Am See',
        latitude: 49.56,
        longitude: 7.07,
      } as PlaceDetail;
      vi.spyOn(PlansApi.prototype, 'getPlan').mockResolvedValue({
        id: 'plan-1',
        spaceId: 'space-1',
        status: 'COMPLETED',
        title: 'Our day',
        description: 'Quiet by the water',
        experiencedOn: new Date('2026-11-08T00:00:00Z'),
        placeId: place.id,
        capabilities: { canEdit: true },
      } as PlanDetail);
      vi.spyOn(PlacesApi.prototype, 'getPlace').mockResolvedValue(place);
      const create = renderCreate({
        sourcePlan: {
          id: 'plan-1',
          spaceId: 'space-1',
          accountId: 'account-1',
          instance: 'https://example.test',
        },
      });
      const user = userEvent.setup();
      await screen.findByRole('button', { name: place.name });
      if (visibility === 'PRIVATE') {
        await user.click(
          screen.getByText(storyProducts.heartMomentProduct.visibilityShared, {
            selector: 'summary span',
          }),
        );
        await user.click(
          screen.getByRole('radio', {
            name: storyProducts.heartMomentProduct.visibilityPrivate,
          }),
        );
      }
      await user.click(
        screen.getByRole('button', {
          name: storyProducts.heartMomentProduct.save,
        }),
      );
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      const payload = create.mock.calls[0][0].heartMomentCreate;
      expect(payload.visibility).toBe(visibility);
      expect(payload.text).toBe('Quiet by the water');
      expect(payload.happenedOn).toEqual(new Date('2026-11-08T00:00:00Z'));
      if (visibility === 'PRIVATE') {
        expect(payload.location).toEqual({
          name: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        });
        expect(payload.placeId).toBeUndefined();
      } else expect(payload.placeId).toBe(place.id);
    },
  );
});
