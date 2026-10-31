// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { M4ProductApis } from '../client/m4Product';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import {
  rememberRetrospectiveDismissal,
  retrospectiveDismissalToken,
} from '../client/todayRetrospectiveDismissal';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import m5s5 from '../i18n/locales/m5s5';
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

describe('Today #452 retrospective presentation and dismissal', () => {
  it('renders only real retrospective text without a photo-shaped placeholder', async () => {
    renderToday();
    expect(await screen.findByText('Our early trip together')).not.toBeNull();
    expect(
      document.querySelector('.today-living-retrospective'),
    ).not.toBeNull();
    expect(document.querySelector('.today-retrospective-photo')).not.toBeNull();
    expect(document.querySelector('.today-retrospective-media')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: m5s5.today.living.retrospectiveDismissToday,
      }),
    ).not.toBeNull();
    expect(
      screen.getByRole('link', { name: /Erinnerung ansehen/i }),
    ).not.toBeNull();
    expect(screen.getByText('23. Oktober 2025')).not.toBeNull();
  });

  it('uses the authorized MemoryPreview for media without a second image API', async () => {
    renderToday({ photo: true });
    expect(await screen.findByText('Our early trip together')).not.toBeNull();
    expect(document.querySelector('.today-retrospective-media')).not.toBeNull();
    await waitFor(() => {
      expect(
        document.querySelector(
          '.today-retrospective-media .story-media-preview',
        ),
      ).not.toBeNull();
    });
  });

  it('dismisses only the retrospective, reveals fallback, and survives remount', async () => {
    const user = userEvent.setup();
    const first = renderToday();
    expect(await screen.findByText('Our early trip together')).not.toBeNull();
    await user.click(
      screen.getByRole('button', {
        name: m5s5.today.living.retrospectiveDismissToday,
      }),
    );

    expect(screen.queryByText('Our early trip together')).toBeNull();
    expect(await screen.findByText('A new shared wish')).not.toBeNull();
    expect(
      screen.getByText(m5s5.today.living.retrospectiveDismissed),
    ).not.toBeNull();

    first.unmount();
    renderToday();
    expect(await screen.findByText('A new shared wish')).not.toBeNull();
    expect(screen.queryByText('Our early trip together')).toBeNull();
  });

  it('does not apply another Account/Space dismissal and respects hidden modules', async () => {
    const stored = retrospectiveDismissalToken(
      'account-1',
      'space-1',
      new Date('2026-10-23'),
    );
    if (!stored) throw new Error('Expected valid marker');
    rememberRetrospectiveDismissal(stored);

    renderToday({ accountId: 'account-2' });
    expect(await screen.findByText('Our early trip together')).not.toBeNull();
    cleanup();
    renderToday({ accountId: 'account-1', spaceId: 'space-2' });
    expect(await screen.findByText('Our early trip together')).not.toBeNull();
    cleanup();
    renderToday({ hideModule: true });
    expect(screen.queryByText('Our early trip together')).toBeNull();
    expect(document.querySelector('.today-section-living')).toBeNull();
  });

  it('uses the server calendar to restore and expire a dismissed retrospective', async () => {
    const stored = retrospectiveDismissalToken(
      'account-1',
      'space-1',
      new Date('2026-10-23'),
    );
    if (!stored) throw new Error('Expected server-day marker');
    rememberRetrospectiveDismissal(stored);

    renderToday({ viewerLocalDate: new Date('2026-10-23') });
    expect(await screen.findByText('A new shared wish')).not.toBeNull();
    expect(screen.queryByText('Our early trip together')).toBeNull();

    cleanup();
    renderToday({ viewerLocalDate: new Date('2026-10-24') });
    expect(await screen.findByText('Our early trip together')).not.toBeNull();
  });

  it('opens the canonical Memory detail and returns with the F2 Today origin', async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(
      await screen.findByRole('link', { name: /Erinnerung ansehen/i }),
    );
    expect(
      screen.getByRole('heading', { name: 'Canonical memory detail' }),
    ).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Return to Today' }));
    expect(await screen.findByText('Our early trip together')).not.toBeNull();
  });
});
