import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RulesApi } from '../api/generated/apis/RulesApi';
import type { RulePreferenceUpdate } from '../api/generated/models/RulePreferenceUpdate';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProblemState } from './ProblemState';

export interface AnniversaryReminderSettingsProps {
  rulesApi: RulesApi;
  spaceId: string;
}

export type PartnerBirthdayReminderSettingsProps =
  AnniversaryReminderSettingsProps;

interface DayPreset {
  days: number;
  labelKey: string;
}

interface RuleReminderSettingsProps {
  rulesApi: RulesApi;
  spaceId: string;
  ruleKey: string;
  idPrefix: string;
  icon: EimirIconName;
  defaultDaysBefore: number[];
  dayPresets: DayPreset[];
  toggleLabelKey: string;
  toggleHelpKey: string;
  timeLabelKey: string;
  loadingKey: string;
}

interface ReminderDraft {
  enabled: boolean;
  daysBefore: number[];
  localTime: string;
}

const ANNIVERSARY_RULE_KEY = 'relationship_anniversary_reminder';
const PARTNER_BIRTHDAY_RULE_KEY = 'partner_birthday_reminder';
const ANNIVERSARY_DEFAULT_DAYS = [30, 0];
const PARTNER_BIRTHDAY_DEFAULT_DAYS = [14, 0];

const ANNIVERSARY_DAY_PRESETS: DayPreset[] = [
  { days: 30, labelKey: 'profileIdentity.anniversaryReminderDay30' },
  { days: 7, labelKey: 'profileIdentity.anniversaryReminderDay7' },
  { days: 1, labelKey: 'profileIdentity.anniversaryReminderDay1' },
  { days: 0, labelKey: 'profileIdentity.anniversaryReminderDay0' },
];

const PARTNER_BIRTHDAY_DAY_PRESETS: DayPreset[] = [
  { days: 14, labelKey: 'profileIdentity.partnerBirthdayReminderDay14' },
  { days: 7, labelKey: 'profileIdentity.partnerBirthdayReminderDay7' },
  { days: 1, labelKey: 'profileIdentity.partnerBirthdayReminderDay1' },
  { days: 0, labelKey: 'profileIdentity.partnerBirthdayReminderDay0' },
];

function sameDays(left: number[], right: number[]): boolean {
  return (
    left.length === right.length && left.every((day) => right.includes(day))
  );
}

function RuleReminderSettings({
  rulesApi,
  spaceId,
  ruleKey,
  idPrefix,
  icon,
  defaultDaysBefore,
  dayPresets,
  toggleLabelKey,
  toggleHelpKey,
  timeLabelKey,
  loadingKey,
}: RuleReminderSettingsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ['rules', spaceId, ruleKey, 'preference'];

  const {
    data: preference,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => rulesApi.getRulePreference({ spaceId, ruleKey }),
  });

  const [draft, setDraft] = useState<ReminderDraft>({
    enabled: true,
    daysBefore: [...defaultDaysBefore],
    localTime: '09:00',
  });

  useEffect(() => {
    if (!preference) return;
    setDraft({
      enabled: preference.enabled,
      daysBefore: preference.parameters.daysBefore ?? defaultDaysBefore,
      localTime: preference.parameters.localTime?.slice(0, 5) ?? '09:00',
    });
  }, [defaultDaysBefore, preference]);

  const mutation = useMutation({
    mutationFn: (update: RulePreferenceUpdate) =>
      rulesApi.setRulePreference({
        spaceId,
        ruleKey,
        rulePreferenceUpdate: update,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
    },
    onError: () => {
      if (!preference) return;
      setDraft({
        enabled: preference.enabled,
        daysBefore: preference.parameters.daysBefore ?? defaultDaysBefore,
        localTime: preference.parameters.localTime?.slice(0, 5) ?? '09:00',
      });
    },
  });

  function savePreference(next: ReminderDraft) {
    if (!preference || mutation.isPending) return;
    const normalized: ReminderDraft = {
      ...next,
      daysBefore: [...next.daysBefore].sort((a, b) => b - a),
    };
    setDraft(normalized);
    const storedTime = preference.parameters.localTime?.slice(0, 5) ?? '09:00';
    if (
      normalized.enabled === preference.enabled &&
      sameDays(
        normalized.daysBefore,
        preference.parameters.daysBefore ?? defaultDaysBefore,
      ) &&
      normalized.localTime === storedTime
    ) {
      return;
    }
    mutation.reset();
    mutation.mutate({
      enabled: normalized.enabled,
      parameters: {
        daysBefore: normalized.daysBefore,
        localTime: normalized.localTime + ':00',
      },
    });
  }

  const label = t(toggleLabelKey);
  const supportedDays = new Set(dayPresets.map((preset) => preset.days));
  const customDays = draft.daysBefore.filter((day) => !supportedDays.has(day));
  const activeDays = [
    ...dayPresets
      .filter((preset) => draft.daysBefore.includes(preset.days))
      .map((preset) => t(preset.labelKey)),
    ...customDays.map((day) =>
      t('profileIdentity.importantDatesOtherDay', { count: day }),
    ),
  ];
  const summary = [
    activeDays.length
      ? activeDays.join(' · ')
      : t('profileIdentity.importantDatesChooseDays'),
    draft.localTime,
  ].join(' · ');

  if (isLoading) {
    return (
      <div className="important-date-card" role="status">
        {t(loadingKey)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="important-date-card">
        <ProblemState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <article className="important-date-card" aria-label={label}>
      <div className="important-date-card-head">
        <span className="important-date-icon" aria-hidden="true">
          <EimirIcon name={icon} variant="duotone" />
        </span>
        <PreferenceSwitch
          className="important-date-switch"
          label={label}
          description={t(toggleHelpKey)}
          checked={draft.enabled}
          disabled={mutation.isPending}
          onCheckedChange={(enabled) => savePreference({ ...draft, enabled })}
        />
      </div>

      {draft.enabled ? (
        <details className="important-date-details">
          <summary>
            <span className="important-date-summary-copy">
              <strong>{t('profileIdentity.importantDatesSchedule')}</strong>
              <span>{summary}</span>
            </span>
            <EimirIcon name="chevron-right" />
          </summary>
          <div className="important-date-edit">
            <fieldset
              className="important-date-day-fieldset"
              disabled={mutation.isPending}
            >
              <legend>{t('profileIdentity.importantDatesChooseDays')}</legend>
              <div className="important-date-day-grid">
                {dayPresets.map((preset) => {
                  const selected = draft.daysBefore.includes(preset.days);
                  return (
                    <label
                      key={preset.days}
                      className={
                        'important-date-day-chip' +
                        (selected ? ' is-selected' : '')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={selected && draft.daysBefore.length === 1}
                        onChange={() => {
                          const nextDays = selected
                            ? draft.daysBefore.filter(
                                (day) => day !== preset.days,
                              )
                            : [...draft.daysBefore, preset.days];
                          savePreference({ ...draft, daysBefore: nextDays });
                        }}
                      />
                      <span>{t(preset.labelKey)}</span>
                    </label>
                  );
                })}
                {customDays.map((day) => (
                  <label
                    key={day}
                    className="important-date-day-chip is-selected"
                  >
                    <input
                      type="checkbox"
                      checked
                      disabled={draft.daysBefore.length === 1}
                      onChange={() =>
                        savePreference({
                          ...draft,
                          daysBefore: draft.daysBefore.filter(
                            (value) => value !== day,
                          ),
                        })
                      }
                    />
                    <span>
                      {t('profileIdentity.importantDatesOtherDay', {
                        count: day,
                      })}
                    </span>
                  </label>
                ))}
              </div>
              <p className="important-date-minimum">
                {t('profileIdentity.importantDatesAtLeastOne')}
              </p>
            </fieldset>
            <div className="important-date-time-row">
              <label htmlFor={idPrefix + '-time'}>{t(timeLabelKey)}</label>
              <input
                id={idPrefix + '-time'}
                name={idPrefix + 'Time'}
                type="time"
                required
                value={draft.localTime}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    localTime: event.target.value,
                  }))
                }
                onBlur={() => {
                  if (
                    draft.localTime &&
                    /^\d{2}:\d{2}$/.test(draft.localTime)
                  ) {
                    savePreference(draft);
                  } else {
                    setDraft((current) => ({
                      ...current,
                      localTime:
                        preference?.parameters.localTime?.slice(0, 5) ??
                        '09:00',
                    }));
                  }
                }}
              />
            </div>
          </div>
        </details>
      ) : null}

      {mutation.isPending || mutation.isSuccess ? (
        <p className="important-date-feedback" role="status" aria-live="polite">
          {t(
            mutation.isPending
              ? 'profileIdentity.anniversaryReminderSaving'
              : 'profileIdentity.anniversaryReminderSaved',
          )}
        </p>
      ) : null}
      {mutation.error ? <ProblemState error={mutation.error} /> : null}
    </article>
  );
}

export function AnniversaryReminderSettings({
  rulesApi,
  spaceId,
}: AnniversaryReminderSettingsProps) {
  return (
    <RuleReminderSettings
      rulesApi={rulesApi}
      spaceId={spaceId}
      ruleKey={ANNIVERSARY_RULE_KEY}
      idPrefix="anniversary-reminder"
      icon="jahrestag"
      defaultDaysBefore={ANNIVERSARY_DEFAULT_DAYS}
      dayPresets={ANNIVERSARY_DAY_PRESETS}
      toggleLabelKey="profileIdentity.anniversaryReminderToggle"
      toggleHelpKey="profileIdentity.anniversaryReminderToggleHelp"
      timeLabelKey="profileIdentity.anniversaryReminderTimeLabel"
      loadingKey="profileIdentity.anniversaryReminderLoading"
    />
  );
}

export function PartnerBirthdayReminderSettings({
  rulesApi,
  spaceId,
}: PartnerBirthdayReminderSettingsProps) {
  return (
    <RuleReminderSettings
      rulesApi={rulesApi}
      spaceId={spaceId}
      ruleKey={PARTNER_BIRTHDAY_RULE_KEY}
      idPrefix="partner-birthday-reminder"
      icon="geburtstag"
      defaultDaysBefore={PARTNER_BIRTHDAY_DEFAULT_DAYS}
      dayPresets={PARTNER_BIRTHDAY_DAY_PRESETS}
      toggleLabelKey="profileIdentity.partnerBirthdayReminderToggle"
      toggleHelpKey="profileIdentity.partnerBirthdayReminderToggleHelp"
      timeLabelKey="profileIdentity.partnerBirthdayReminderTimeLabel"
      loadingKey="profileIdentity.partnerBirthdayReminderLoading"
    />
  );
}
