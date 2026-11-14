// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RemindersApi } from '../api/generated/apis/RemindersApi';
import { WishesApi } from '../api/generated/apis/WishesApi';
import type { ReminderDetail } from '../api/generated/models/ReminderDetail';
import { ResponseError } from '../api/generated/runtime';
import { ReminderReadPage } from './ReminderReadPage';
import { i18n } from '../i18n';

const reminder: ReminderDetail = {
  id: 'reminder-a',
  spaceId: 'space-a',
  title: 'Einkaufen',
  description: 'Für das Wochenende.',
  source: 'MANUAL',
  sourceType: null,
  sourceId: null,
  ruleKey: null,
  schedule: { type: 'ONCE', at: new Date('2026-11-02T16:00:00Z') },
  offsets: [0],
  muted: false,
  version: 1,
  createdBy: 'partner-a',
  creator: { id: 'partner-a', displayName: 'Alex' },
  createdAt: new Date(),
  updatedAt: new Date(),
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  originWish: null,
};
const base = 'https://example.test';

function setup(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/plan/reminders/reminder-a']}>
        <Routes>
          <Route
            path="/plan/reminders/:reminderId"
            element={
              <ReminderReadPage
                apiBaseUrl={base}
                accessToken="synthetic-token"
                accountId="account-a"
                spaceId="space-a"
                timeZone="Europe/Berlin"
              />
            }
          />
          <Route
            path="/more/notifications"
            element={<h1>Inbox destination</h1>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client };
}

it('opens the actual reminder as a read view and returns to the inbox', async () => {
  const read = vi
    .spyOn(RemindersApi.prototype, 'getReminder')
    .mockResolvedValue(reminder);
  setup();
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Einkaufen' }),
  ).toBeTruthy();
  expect(screen.getByText('Für das Wochenende.')).toBeTruthy();
  expect(screen.getByText('Von Alex')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(read).toHaveBeenCalledWith(
    { spaceId: 'space-a', reminderId: 'reminder-a' },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Zurück zu den Benachrichtigungen' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Inbox destination' }),
  ).toBeTruthy();
});

it('hides a previously cached title when the authoritative read is denied', async () => {
  vi.spyOn(RemindersApi.prototype, 'getReminder').mockRejectedValue(
    new ResponseError(new Response('{}', { status: 404 })),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ['reminder-detail', base, 'account-a', 'space-a', 'reminder-a'],
    reminder,
  );
  setup(client);
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: 'Einkaufen' })).toBeNull(),
  );
  expect(
    await screen.findByText(i18n.t('states.permission.title')),
  ).toBeTruthy();
});

const withWish = {
  ...reminder,
  source: 'GENERATED' as const,
  sourceType: 'PLAN',
  sourceId: 'plan-a',
  originWish: { wishId: 'wish-9', seriesPosition: 2 },
};

it('names the wish behind a plan reminder and links to it (#1816)', async () => {
  vi.spyOn(RemindersApi.prototype, 'getReminder').mockResolvedValue(withWish);
  const getWish = vi
    .spyOn(WishesApi.prototype, 'getWish')
    .mockResolvedValue({ title: 'Ostsee' } as never);
  setup();
  const link = await screen.findByRole('link', {
    name: i18n.t('wishRepeat.reminder.fromWishTitledNth', {
      title: 'Ostsee',
      position: 2,
    }),
  });
  expect(link.getAttribute('href')).toBe('/plan/wishes/wish-9');
  expect(getWish).toHaveBeenCalledWith(
    { spaceId: 'space-a', wishId: 'wish-9' },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it('keeps a generic wish line when the wish cannot be read (#1816)', async () => {
  vi.spyOn(RemindersApi.prototype, 'getReminder').mockResolvedValue({
    ...withWish,
    originWish: { wishId: 'wish-9', seriesPosition: 1 },
  });
  vi.spyOn(WishesApi.prototype, 'getWish').mockRejectedValue(
    new ResponseError(new Response('{}', { status: 404 })),
  );
  setup();
  const link = await screen.findByRole('link', {
    name: i18n.t('wishRepeat.reminder.fromWish'),
  });
  expect(link.getAttribute('href')).toBe('/plan/wishes/wish-9');
});

it('shows no wish line for a manual reminder (#1816)', async () => {
  vi.spyOn(RemindersApi.prototype, 'getReminder').mockResolvedValue(reminder);
  setup();
  await screen.findByRole('heading', { level: 1, name: 'Einkaufen' });
  expect(
    screen.queryByRole('link', {
      name: i18n.t('wishRepeat.reminder.fromWish'),
    }),
  ).toBeNull();
});
