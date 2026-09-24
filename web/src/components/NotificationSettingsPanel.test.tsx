import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { NotificationChannel } from '../api/generated/models/NotificationChannel';
import { NotificationKind } from '../api/generated/models/NotificationKind';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import notificationSettings from '../i18n/locales/notificationSettings';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';

function view(emailAvailable = true): NotificationPreferencesView {
  return {
    catalogVersion: 2,
    quietHours: {
      enabled: false,
      start: null,
      end: null,
      timeZone: 'Europe/Berlin',
    },
    capabilities: [
      { channel: NotificationChannel.IN_APP, available: true, reason: null },
      {
        channel: NotificationChannel.PUSH,
        available: false,
        reason: 'PUSH_ENDPOINT_MISSING',
      },
      {
        channel: NotificationChannel.EMAIL,
        available: emailAvailable,
        reason: emailAvailable ? null : 'EMAIL_TRANSPORT_UNAVAILABLE',
        destination: 'current@example.org',
      },
    ],
    items: [
      {
        kind: NotificationKind.COMMENT_CREATED,
        deliveryClass: 'DIGESTIBLE',
        channels: [
          {
            channel: NotificationChannel.IN_APP,
            enabled: true,
            configurable: true,
          },
          {
            channel: NotificationChannel.PUSH,
            enabled: false,
            configurable: false,
          },
          {
            channel: NotificationChannel.EMAIL,
            enabled: false,
            configurable: false,
          },
        ],
      },
      {
        kind: NotificationKind.REMINDER_DUE,
        deliveryClass: 'IMMEDIATE',
        channels: [
          {
            channel: NotificationChannel.IN_APP,
            enabled: true,
            configurable: true,
          },
          {
            channel: NotificationChannel.PUSH,
            enabled: true,
            configurable: true,
          },
          {
            channel: NotificationChannel.EMAIL,
            enabled: false,
            configurable: emailAvailable,
          },
        ],
      },
    ],
  };
}

function setup(
  data: NotificationPreferencesView,
  update = vi.fn().mockResolvedValue({
    kind: NotificationKind.REMINDER_DUE,
    channel: NotificationChannel.EMAIL,
    enabled: true,
  }),
) {
  const getOwnNotificationPreferences = vi.fn().mockResolvedValue(data);
  const updateOwnQuietHours = vi.fn().mockResolvedValue({
    enabled: true,
    start: '22:00:00',
    end: '07:00:00',
    timeZone: data.quietHours.timeZone,
  });
  const notificationsApi = {
    getOwnNotificationPreferences,
    updateOwnNotificationPreference: update,
    updateOwnQuietHours,
  } as unknown as NotificationsApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationSettingsPanel
          notificationsApi={notificationsApi}
          accountId="owner"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { update, updateOwnQuietHours, getOwnNotificationPreferences };
}

describe('NotificationSettingsPanel', () => {
  it('updates only the selected owner channel after server confirmation', async () => {
    const { update } = setup(view());
    const email = await screen.findByRole('switch', {
      name: 'Fällige Erinnerungen: E-Mail',
    });
    expect(email.getAttribute('aria-checked')).toBe('false');
    expect(
      screen.getByText('current@example.org', { exact: false }),
    ).toBeDefined();
    expect(
      screen
        .getByRole('switch', { name: 'Fällige Erinnerungen: In-App' })
        .getAttribute('aria-checked'),
    ).toBe('true');

    fireEvent.click(email);
    await waitFor(() =>
      expect(email.getAttribute('aria-checked')).toBe('true'),
    );
    expect(update).toHaveBeenCalledWith({
      kind: NotificationKind.REMINDER_DUE,
      channel: NotificationChannel.EMAIL,
      notificationPreferenceUpdate: { enabled: true },
    });
    expect(
      screen
        .getByRole('switch', { name: 'Fällige Erinnerungen: In-App' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByRole('status').textContent).toContain(
      notificationSettings.saved
        .replace('{{event}}', notificationSettings.reminder)
        .replace('{{channel}}', notificationSettings.email),
    );
  });

  it('keeps unreviewed and unavailable delivery channels closed', async () => {
    const { update } = setup(view(false));
    const commentEmail = await screen.findByRole('switch', {
      name: 'Kommentare: E-Mail',
    });
    const reminderEmail = screen.getByRole('switch', {
      name: 'Fällige Erinnerungen: E-Mail',
    });
    expect(commentEmail.hasAttribute('disabled')).toBe(true);
    expect(reminderEmail.hasAttribute('disabled')).toBe(true);
    expect(
      screen.getAllByText(notificationSettings.transportUnavailable).length,
    ).toBeGreaterThan(0);
    fireEvent.click(commentEmail);
    fireEvent.click(reminderEmail);
    expect(update).not.toHaveBeenCalled();
  });

  it('retains the persisted value and reports a failed write', async () => {
    setup(view(), vi.fn().mockRejectedValue(new Error('offline')));
    const email = await screen.findByRole('switch', {
      name: 'Fällige Erinnerungen: E-Mail',
    });
    fireEvent.click(email);
    await waitFor(() =>
      expect(screen.getByText(notificationSettings.failed)).toBeDefined(),
    );
    expect(email.getAttribute('aria-checked')).toBe('false');
  });

  it('saves a personal quiet window as one draft and restores the server state', async () => {
    const { updateOwnQuietHours } = setup(view());
    const quietSwitch = await screen.findByRole('switch', {
      name: notificationSettings.quietHoursEnable,
    });
    fireEvent.click(quietSwitch);
    expect(updateOwnQuietHours).not.toHaveBeenCalled();
    expect(
      screen.getByText(notificationSettings.quietHoursUnsaved),
    ).toBeDefined();
    expect(
      (
        screen.getByLabelText(
          notificationSettings.quietHoursStart,
        ) as HTMLInputElement
      ).value,
    ).toBe('22:00');
    fireEvent.click(
      screen.getByRole('button', { name: notificationSettings.quietHoursSave }),
    );
    await waitFor(() =>
      expect(updateOwnQuietHours).toHaveBeenCalledWith({
        quietHoursUpdate: { enabled: true, start: '22:00', end: '07:00' },
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(notificationSettings.quietHoursSaved),
      ).toBeDefined(),
    );
    expect(quietSwitch.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Täglich 22:00–07:00 Uhr.')).toBeDefined();
  });

  it('rejects equal times and retains a failed save draft', async () => {
    const { updateOwnQuietHours } = setup(view());
    updateOwnQuietHours.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(
      await screen.findByRole('switch', {
        name: notificationSettings.quietHoursEnable,
      }),
    );
    const end = screen.getByLabelText(
      notificationSettings.quietHoursEnd,
    ) as HTMLInputElement;
    fireEvent.change(end, { target: { value: '22:00' } });
    expect(
      screen.getByText(notificationSettings.quietHoursInvalid),
    ).toBeDefined();
    expect(
      screen
        .getByRole('button', { name: notificationSettings.quietHoursSave })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.change(end, { target: { value: '06:30' } });
    fireEvent.click(
      screen.getByRole('button', { name: notificationSettings.quietHoursSave }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(notificationSettings.quietHoursFailed),
      ).toBeDefined(),
    );
    expect(end.value).toBe('06:30');
    expect(
      screen.getByText(notificationSettings.quietHoursUnsaved),
    ).toBeDefined();
  });
});
// @vitest-environment jsdom
