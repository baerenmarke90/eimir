// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RemindersApi } from '../api/generated/apis/RemindersApi';
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
