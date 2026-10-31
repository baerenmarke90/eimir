// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { M4ProductApis } from '../client/m4Product';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import { TodayPage } from './TodayPage';

const memory = {
  id: 'history-2025',
  type: 'MEMORY',
  titleOrText: 'Our early trip together',
  occurredOn: new Date('2025-10-23'),
  createdAt: new Date('2025-11-01T10:00:00Z'),
  scheduledAt: null,
  previewAttachmentId: null as string | null,
  previewIsSensitive: false,
};

const wish = {
  id: 'wish-1',
  type: 'WISH',
  titleOrText: 'A new shared wish',
  createdAt: new Date('2026-10-01T10:00:00Z'),
};

function dashboard(photo = false, viewerLocalDate = new Date('2026-10-23')) {
  return {
    viewerLocalDate,
    space: {
      id: 'space-1',
      partner: { id: 'partner-1', displayName: 'Marie' },
    },
    relationshipDuration: null,
    upcoming: [],
    recentShared: [wish],
    keepsake: null,
    retrospective: {
      ...memory,
      previewAttachmentId: photo ? 'attachment-1' : null,
      previewIsSensitive: false,
    },
    thinkingOfYouAvailableAt: null,
  };
}

function DetailProbe() {
  const { requestReturn } = useTaskOrigin();
  const location = useLocation();
  const origin = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;

  return (
    <main>
      <h1>Canonical memory detail</h1>
      <button type="button" onClick={() => requestReturn(origin)}>
        Return to Today
      </button>
    </main>
  );
}

function renderToday({
  accountId = 'account-1',
  spaceId = 'space-1',
  photo = false,
  hideModule = false,
  viewerLocalDate = new Date('2026-10-23'),
}: {
  accountId?: string;
  spaceId?: string;
  photo?: boolean;
  hideModule?: boolean;
  viewerLocalDate?: Date;
} = {}) {
  const data = dashboard(photo, viewerLocalDate);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['m5-s5', 'dashboard', spaceId], data);
  client.setQueryData(dashboardPreferencesQueryKey(accountId, spaceId), {
    items: hideModule
      ? [{ moduleKey: 'relationship_signal', visible: false }]
      : [],
  });
  const apis = {
    dashboard: {
      getDashboard: () => Promise.resolve(data),
      listDashboardModulePreferences: () =>
        Promise.resolve({
          items: hideModule
            ? [{ moduleKey: 'relationship_signal', visible: false }]
            : [],
        }),
    },
    activity: {
      getActivity: () =>
        Promise.resolve({ items: [], nextCursor: null, hasMore: false }),
    },
  } as unknown as M4ProductApis;

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/today']}>
        <TaskOriginProvider accountId={accountId} spaceId={spaceId}>
          <Routes>
            <Route
              path="/today"
              element={
                <TodayPage
                  apis={apis}
                  spaceId={spaceId}
                  account={{ id: accountId, displayName: 'Alex' }}
                  loadMemoryImage={() =>
                    Promise.resolve('blob:http://localhost/authorized')
                  }
                />
              }
            />
            <Route path="/story/memories/:memoryId" element={<DetailProbe />} />
          </Routes>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Wir retrospective removal (#1546)', () => {
  it.each([false, true])(
    'never renders a server retrospective (media=%s)',
    async (photo) => {
      renderToday({ photo });
      expect(await screen.findByText(wish.titleOrText)).not.toBeNull();
      expect(screen.queryByText(memory.titleOrText)).toBeNull();
      expect(document.querySelector('.today-living-retrospective')).toBeNull();
      expect(document.querySelector('.today-section-monthly')).toBeNull();
      expect(screen.queryByRole('link', { name: /Beziehungspass/ })).toBeNull();
    },
  );
});
