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
  const getFn = vi.fn().mockResolvedValue(initialPreference);
  const setFn = vi.fn().mockImplementation(async ({ rulePreferenceUpdate }) => {
    return {
      ruleKey: 'relationship_anniversary_reminder',
      enabled: rulePreferenceUpdate.enabled,
      parameters: {
        daysBefore: rulePreferenceUpdate.parameters?.daysBefore ?? [30, 7, 1],
        localTime: rulePreferenceUpdate.parameters?.localTime ?? '09:00:00',
      },
    };
  });

  return {
    getRulePreference: getFn,
    setRulePreference: setFn,
  } as unknown as RulesApi;
}

function renderComponent(rulesApi: RulesApi) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AnniversaryReminderSettings rulesApi={rulesApi} spaceId={SPACE_ID} />
    </QueryClientProvider>,
  );
}

describe('AnniversaryReminderSettings', () => {
  it('renders loaded preference with toggle, day presets, and time input', async () => {
    const rulesApi = createMockRulesApi();
    renderComponent(rulesApi);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/An unseren Jahrestag erinnern/i),
      ).toBeDefined();
    });

    const toggle = screen.getByLabelText(
      /An unseren Jahrestag erinnern/i,
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    expect(screen.getByText(/30 Tage vorher/i)).toBeDefined();
    expect(screen.getByText(/7 Tage vorher/i)).toBeDefined();
    expect(screen.getByText(/1 Tag vorher/i)).toBeDefined();

    const timeInput = screen.getByLabelText(
      profileIdentity.anniversaryReminderTimeLabel,
    ) as HTMLInputElement;
    expect(timeInput.value).toBe('09:00');

    const saveBtn = screen.getByRole('button', {
      name: /Änderungen speichern/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('enables save button on edit and calls setRulePreference on submit', async () => {
    const rulesApi = createMockRulesApi();
    renderComponent(rulesApi);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/An unseren Jahrestag erinnern/i),
      ).toBeDefined();
    });

    const timeInput = screen.getByLabelText(
      profileIdentity.anniversaryReminderTimeLabel,
    ) as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '10:30' } });

    const saveBtn = screen.getByRole('button', {
      name: /Änderungen speichern/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(rulesApi.setRulePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: SPACE_ID,
          ruleKey: 'relationship_anniversary_reminder',
          rulePreferenceUpdate: expect.objectContaining({
            enabled: true,
            parameters: expect.objectContaining({
              daysBefore: [30, 7, 1],
              localTime: '10:30:00',
            }),
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('✓ Gespeichert')).toBeDefined();
    });
  });

  it('hides configuration controls when disabled toggle is unchecked', async () => {
    const rulesApi = createMockRulesApi();
    renderComponent(rulesApi);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/An unseren Jahrestag erinnern/i),
      ).toBeDefined();
    });

    const toggle = screen.getByLabelText(
      /An unseren Jahrestag erinnern/i,
    ) as HTMLInputElement;
    fireEvent.click(toggle);

    expect(toggle.checked).toBe(false);
    expect(screen.queryByText(/30 Tage vorher/i)).toBeNull();
    expect(
      screen.queryByLabelText(profileIdentity.anniversaryReminderTimeLabel),
    ).toBeNull();

    const saveBtn = screen.getByRole('button', {
      name: /Änderungen speichern/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(rulesApi.setRulePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          rulePreferenceUpdate: expect.objectContaining({
            enabled: false,
          }),
        }),
      );
    });
  });
});

describe('PartnerBirthdayReminderSettings', () => {
  it('uses the recipient-scoped partner birthday rule', async () => {
    const getRulePreference = vi.fn().mockResolvedValue({
      ruleKey: 'partner_birthday_reminder',
      enabled: true,
      parameters: {
        daysBefore: [14, 7, 1],
        localTime: '09:00:00',
      },
    });
    const setRulePreference = vi
      .fn()
      .mockImplementation(async ({ rulePreferenceUpdate }) => ({
        ruleKey: 'partner_birthday_reminder',
        enabled: rulePreferenceUpdate.enabled,
        parameters: rulePreferenceUpdate.parameters,
      }));
    const rulesApi = {
      getRulePreference,
      setRulePreference,
    } as unknown as RulesApi;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PartnerBirthdayReminderSettings
          rulesApi={rulesApi}
          spaceId={SPACE_ID}
        />
      </QueryClientProvider>,
    );

    const toggle = await screen.findByLabelText(
      profileIdentity.partnerBirthdayReminderToggle,
    );
    expect(
      screen.getByText(profileIdentity.partnerBirthdayReminderDay14),
    ).toBeDefined();
    expect(getRulePreference).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      ruleKey: 'partner_birthday_reminder',
    });

    fireEvent.click(toggle);
    fireEvent.click(
      screen.getByRole('button', {
        name: profileIdentity.anniversaryReminderSave,
      }),
    );

    await waitFor(() =>
      expect(setRulePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: SPACE_ID,
          ruleKey: 'partner_birthday_reminder',
          rulePreferenceUpdate: expect.objectContaining({ enabled: false }),
        }),
      ),
    );
  });
});
