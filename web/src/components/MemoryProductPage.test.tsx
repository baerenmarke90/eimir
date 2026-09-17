// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import de from '../i18n/locales/de';
import memoryProduct from '../i18n/locales/memoryProduct';
import taskBoundary from '../i18n/locales/taskBoundary';
import { AppShell } from './AppShell';
import { MemoryProductPage } from './MemoryProductPage';

vi.mock('./CommentsPanel', () => ({ CommentsPanel: () => null }));
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
afterEach(cleanup);

function TimelineEntry() {
  const navigate = useNavigate();
  const location = useLocation();
  const { captureOrigin } = useTaskOrigin();
  return (
    <>
      <output data-testid="timeline-scope">{location.search}</output>
      <button
        type="button"
        onClick={() => {
          const taskOriginKey = captureOrigin({
            loadedPageCount: 3,
            selectedKey: 'memory-memory-1',
          });
          void navigate('/story/memories/memory-1/edit', {
            state: { taskOriginKey },
          });
        }}
      >
        Edit selected Memory
      </button>
    </>
  );
}
function setup(canEdit: boolean) {
  window.history.replaceState(null, '', '/story');
  const memory: MemoryDetail = {
    id: 'memory-1',
    spaceId: 'space-1',
    authorId: 'account-1',
    author: { id: 'account-1', displayName: 'Alex' },
    title: 'A shared evening',
    body: 'Quiet words',
    attachments: [],
    happenedOn: new Date('2025-09-15'),
    createdAt: new Date('2025-09-15'),
    updatedAt: new Date('2025-09-15'),
    version: 1,
    capabilities: { canEdit, canDelete: false, canComment: false },
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['profile-identity', 'space-1', 'account-1'], {
    accountId: 'account-1',
    displayName: 'Alex',
    profileAttachmentId: null,
    version: 1,
  });
  client.setQueryData(['m5-s5', 'notification-unread-count', 'space-1'], {
    unreadCount: 0,
  });
  client.setQueryData(authorSummaryQueryKeys.space('space-1'), {
    id: 'space-1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    partners: [],
  });
  client.setQueryData(authorSummaryQueryKeys.memory('space-1', memory.id), {
    value: memory,
    source: 'network',
  });
  const props = {
    apis: {} as ReferenceApis,
    apiBaseUrl: 'http://example.test',
    accessToken: 'test',
    spaceId: 'space-1',
    currentAccountId: 'account-1',
    loadMemoryImage: async () => '',
  };
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={['/story?tab=timeline&type=MEMORY&year=2025&order=ASC']}
      >
        <TaskOriginProvider accountId="account-1" spaceId="space-1">
          <AppShell
            onLogout={() => undefined}
            apiBaseUrl="http://example.test"
            accessToken="test"
            account={{ id: 'account-1', displayName: 'Alex' }}
            spaceId="space-1"
          >
            <Routes>
              <Route path="/story" element={<TimelineEntry />} />
              <Route
                path="/story/memories/:memoryId/edit"
                element={<MemoryProductPage mode="edit" {...props} />}
              />
              <Route
                path="/story/memories/:memoryId"
                element={<MemoryProductPage mode="detail" {...props} />}
              />
            </Routes>
          </AppShell>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Memory editor return context', () => {
  it.each([
    { canEdit: true, exit: 'cancel' },
    { canEdit: true, exit: 'back' },
    { canEdit: false, exit: 'back' },
  ])(
    'preserves scoped Timeline origin for edit=$canEdit via $exit',
    async ({ canEdit, exit }) => {
      setup(canEdit);
      fireEvent.click(screen.getByText('Edit selected Memory'));
      fireEvent.click(
        screen.getByRole('link', {
          name:
            exit === 'cancel' ? de.common.cancel : memoryProduct.backToMemory,
        }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: taskBoundary.back,
        }),
      );
      const scope = new URLSearchParams(
        (await screen.findByTestId('timeline-scope')).textContent ?? '',
      );
      expect(scope.get('tab')).toBe('timeline');
      expect(scope.get('type')).toBe('MEMORY');
      expect(scope.get('year')).toBe('2025');
      expect(scope.get('order')).toBe('ASC');
    },
  );
});

describe('Memory view receipt', () => {
  it('emits a receipt strictly on successful presentation, not during load or failure', async () => {
    const recordStoryViewMock = vi.fn().mockResolvedValue(undefined);
    let getMemoryMock = vi.fn().mockReturnValue(new Promise(() => {}));
    const apis = {
      story: { recordStoryView: recordStoryViewMock },
      memories: { getMemory: (...args: any[]) => getMemoryMock(...args) },
    } as unknown as ReferenceApis;

    const memory: MemoryDetail = {
      id: 'memory-1',
      spaceId: 'space-1',
      authorId: 'account-1',
      author: { id: 'account-1', displayName: 'Alex' },
      title: 'A shared evening',
      body: 'Quiet words',
      attachments: [],
      happenedOn: new Date('2025-09-15'),
      createdAt: new Date('2025-09-15'),
      updatedAt: new Date('2025-09-15'),
      version: 1,
      capabilities: { canEdit: false, canDelete: false, canComment: false },
    };

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(['profile-identity', 'space-1', 'account-1'], {
      accountId: 'account-1',
      displayName: 'Alex',
      profileAttachmentId: null,
      version: 1,
    });
    client.setQueryData(['m5-s5', 'notification-unread-count', 'space-1'], {
      unreadCount: 0,
    });
    client.setQueryData(authorSummaryQueryKeys.space('space-1'), {
      id: 'space-1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      partners: [],
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/story/memories/memory-1']}>
          <TaskOriginProvider accountId="account-1" spaceId="space-1">
            <AppShell
              onLogout={() => undefined}
              apiBaseUrl="http://example.test"
              accessToken="test"
              account={{ id: 'account-1', displayName: 'Alex' }}
              spaceId="space-1"
            >
              <Routes>
                <Route
                  path="/story/memories/:memoryId"
                  element={
                    <MemoryProductPage
                      mode="detail"
                      apis={apis}
                      apiBaseUrl="http://example.test"
                      accessToken="test"
                      spaceId="space-1"
                      currentAccountId="account-1"
                      loadMemoryImage={async () => ''}
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
    getMemoryMock.mockResolvedValue(memory);
    client.invalidateQueries({ queryKey: ['memory'] });

    // Use screen.findByText to wait for successful presentation
    expect(await screen.findByText('A shared evening')).toBeTruthy();

    expect(recordStoryViewMock).toHaveBeenCalledTimes(1);
    expect(recordStoryViewMock).toHaveBeenCalledWith({
      spaceId: 'space-1',
      storyViewReceipt: { kind: 'MEMORY', itemId: 'memory-1' },
    });
  });
});
