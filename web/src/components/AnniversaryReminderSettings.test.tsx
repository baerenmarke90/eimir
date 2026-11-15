// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AnniversaryReminderSettings,
  PartnerBirthdayReminderSettings,
} from './AnniversaryReminderSettings';
import type { RulesApi } from '../api/generated/apis/RulesApi';
import type { RulePreferenceView } from '../api/generated/models/RulePreferenceView';
import profileIdentity from '../i18n/locales/profileIdentity';

const SPACE_ID = 'test-space-456';

function createMockRulesApi(
  initialPreference: RulePreferenceView = {
    ruleKey: 'relationship_anniversary_reminder',
    enabled: true,
    parameters: {
      daysBefore: [30, 7, 1],
      localTime: '09:00:00',
    },
  },
) {
  const getRulePreference = vi.fn().mockResolvedValue(initialPreference);
  const setRulePreference = vi
    .fn()
    .mockImplementation(async ({ rulePreferenceUpdate }) => ({
      ruleKey: initialPreference.ruleKey,
      enabled: rulePreferenceUpdate.enabled,
      parameters: {
        daysBefore:
          rulePreferenceUpdate.parameters?.daysBefore ??
          initialPreference.parameters.daysBefore,
        localTime:
          rulePreferenceUpdate.parameters?.localTime ??
          initialPreference.parameters.localTime,
      },
    }));

  return {
    getRulePreference,
    setRulePreference,
  } as unknown as RulesApi;
}

function renderReminder(rulesApi: RulesApi, birthday = false) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {birthday ? (
        <PartnerBirthdayReminderSettings
          rulesApi={rulesApi}
          spaceId={SPACE_ID}
        />
      ) : (
        <AnniversaryReminderSettings rulesApi={rulesApi} spaceId={SPACE_ID} />
      )}
    </QueryClientProvider>,
  );
}

function expandSchedule() {
  const summary = screen.getByText(profileIdentity.importantDatesSchedule);
  fireEvent.click(summary.closest('summary')!);
}

describe('AnniversaryReminderSettings', () => {
  it('shows a compact schedule preview and reuses the settings switch', async () => {
    const rulesApi = createMockRulesApi();
    renderReminder(rulesApi);

    const toggle = await screen.findByRole('switch', {
      name: profileIdentity.anniversaryReminderToggle,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(
      screen.getByText('30 Tage vorher · 7 Tage vorher · 1 Tag vorher · 09:00'),
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: /Änderungen speichern/i }),
    ).toBeNull();

    expandSchedule();
    expect(
      screen.getByRole('checkbox', { name: '30 Tage vorher' }),
    ).toBeDefined();
    expect(
      screen.getByRole('checkbox', { name: '7 Tage vorher' }),
    ).toBeDefined();
    expect(
      (
        screen.getByLabelText(
          profileIdentity.anniversaryReminderTimeLabel,
        ) as HTMLInputElement
      ).value,
    ).toBe('09:00');
  });

  it('saves a switch change immediately and hides the schedule when disabled', async () => {
    const rulesApi = createMockRulesApi();
    renderReminder(rulesApi);

    const toggle = await screen.findByRole('switch', {
      name: profileIdentity.anniversaryReminderToggle,
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(rulesApi.setRulePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: SPACE_ID,
          ruleKey: 'relationship_anniversary_reminder',
          rulePreferenceUpdate: {
            enabled: false,
            parameters: {
              daysBefore: [30, 7, 1],
              localTime: '09:00:00',
            },
          },
        }),
      );
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
    expect(
      screen.queryByText(profileIdentity.importantDatesSchedule),
    ).toBeNull();
  });

  it('saves selected days without a submit button', async () => {
    const rulesApi = createMockRulesApi();
    renderReminder(rulesApi);

    await screen.findByRole('switch');
    expandSchedule();
    fireEvent.click(screen.getByRole('checkbox', { name: '7 Tage vorher' }));

    await waitFor(() =>
      expect(rulesApi.setRulePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          rulePreferenceUpdate: expect.objectContaining({
            enabled: true,
            parameters: { daysBefore: [30, 1], localTime: '09:00:00' },
          }),
        }),
      ),
    );
    expect(
      await screen.findByText(profileIdentity.anniversaryReminderSaved),
    ).toBeDefined();
  });

  it('saves a changed time when the time picker loses focus', async () => {
    const rulesApi = createMockRulesApi();
    renderReminder(rulesApi);

    await screen.findByRole('switch');
    expandSchedule();
    const time = screen.getByLabelText(
      profileIdentity.anniversaryReminderTimeLabel,
    );
    fireEvent.change(time, { target: { value: '10:30' } });
    fireEvent.blur(time);

    await waitFor(() =>
      expect(rulesApi.setRulePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          rulePreferenceUpdate: expect.objectContaining({
            parameters: { daysBefore: [30, 7, 1], localTime: '10:30:00' },
          }),
        }),
      ),
    );
  });

  it('prevents an enabled reminder from losing its final selected day', async () => {
    const rulesApi = createMockRulesApi({
      ruleKey: 'relationship_anniversary_reminder',
      enabled: true,
      parameters: { daysBefore: [0], localTime: '09:00:00' },
    });
    renderReminder(rulesApi);

    await screen.findByRole('switch');
    expandSchedule();

    const finalDay = screen.getByRole('checkbox', {
      name: profileIdentity.anniversaryReminderDay0,
    });
    expect((finalDay as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(finalDay);
    expect(rulesApi.setRulePreference).not.toHaveBeenCalled();
  });

  it('restores the persisted switch value when saving fails', async () => {
    const rulesApi = createMockRulesApi();
    vi.mocked(rulesApi.setRulePreference).mockRejectedValueOnce(
      new Error('Offline'),
    );
    renderReminder(rulesApi);

    const toggle = await screen.findByRole('switch');
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(toggle.getAttribute('aria-checked')).toBe('true'),
    );
    expect(rulesApi.setRulePreference).toHaveBeenCalledTimes(1);
  });
});

describe('PartnerBirthdayReminderSettings', () => {
  it('uses a separate account-scoped rule and matching birthday schedule', async () => {
    const rulesApi = createMockRulesApi({
      ruleKey: 'partner_birthday_reminder',
      enabled: true,
      parameters: {
        daysBefore: [14, 7, 1],
        localTime: '09:00:00',
      },
    });
    renderReminder(rulesApi, true);

    const toggle = await screen.findByRole('switch', {
      name: profileIdentity.partnerBirthdayReminderToggle,
    });
    expect(
      screen.getByText('14 Tage vorher · 7 Tage vorher · 1 Tag vorher · 09:00'),
    ).toBeDefined();
    expect(rulesApi.getRulePreference).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      ruleKey: 'partner_birthday_reminder',
    });

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(rulesApi.setRulePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: SPACE_ID,
          ruleKey: 'partner_birthday_reminder',
          rulePreferenceUpdate: expect.objectContaining({ enabled: false }),
        }),
      ),
    );
  });
});
