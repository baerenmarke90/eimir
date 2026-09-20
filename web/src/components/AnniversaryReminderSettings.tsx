import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RulesApi } from '../api/generated/apis/RulesApi';
import type { RulePreferenceUpdate } from '../api/generated/models/RulePreferenceUpdate';
import { useTranslation } from '../i18n';
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
  defaultDaysBefore: number[];
  dayPresets: DayPreset[];
  toggleLabelKey: string;
  toggleHelpKey: string;
  daysHeadingKey: string;
  timeLabelKey: string;
  loadingKey: string;
}

const ANNIVERSARY_RULE_KEY = 'relationship_anniversary_reminder';
const PARTNER_BIRTHDAY_RULE_KEY = 'partner_birthday_reminder';
const ANNIVERSARY_DEFAULT_DAYS = [30, 7, 1];
const PARTNER_BIRTHDAY_DEFAULT_DAYS = [14, 7, 1];

const ANNIVERSARY_DAY_PRESETS: DayPreset[] = [
  { days: 30, labelKey: 'profileIdentity.anniversaryReminderDay30' },
  { days: 7, labelKey: 'profileIdentity.anniversaryReminderDay7' },
  { days: 1, labelKey: 'profileIdentity.anniversaryReminderDay1' },
];

const PARTNER_BIRTHDAY_DAY_PRESETS: DayPreset[] = [
  { days: 14, labelKey: 'profileIdentity.partnerBirthdayReminderDay14' },
  { days: 7, labelKey: 'profileIdentity.partnerBirthdayReminderDay7' },
  { days: 1, labelKey: 'profileIdentity.partnerBirthdayReminderDay1' },
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
  defaultDaysBefore,
  dayPresets,
  toggleLabelKey,
  toggleHelpKey,
  daysHeadingKey,
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

  const [enabled, setEnabled] = useState(true);
  const [daysBefore, setDaysBefore] = useState<number[]>(defaultDaysBefore);
  const [localTime, setLocalTime] = useState('09:00');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!preference) return;
    setEnabled(preference.enabled);
    setDaysBefore(preference.parameters.daysBefore ?? defaultDaysBefore);
    setLocalTime(preference.parameters.localTime?.slice(0, 5) ?? '09:00');
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
      setSaved(true);
    },
  });

  if (isLoading) {
    return <p className="form-hint">{t(loadingKey)}</p>;
  }

  if (error) {
    return <ProblemState error={error} onRetry={() => void refetch()} />;
  }

  const initialEnabled = preference?.enabled ?? true;
  const initialDaysBefore =
    preference?.parameters.daysBefore ?? defaultDaysBefore;
  const initialLocalTime =
    preference?.parameters.localTime?.slice(0, 5) ?? '09:00';
  const isDirty =
    enabled !== initialEnabled ||
    localTime !== initialLocalTime ||
    !sameDays(daysBefore, initialDaysBefore);

  function toggleDay(day: number) {
    setDaysBefore((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => b - a),
    );
    setSaved(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || mutation.isPending) return;
    mutation.mutate({
      enabled,
      parameters: {
        daysBefore: [...daysBefore].sort((a, b) => b - a),
        localTime: localTime ? `${localTime}:00` : null,
      },
    });
  }

  const enabledId = `${idPrefix}-enabled`;
  const timeId = `${idPrefix}-time`;

  return (
    <form
      className="anniversary-reminder-form rule-reminder-form"
      onSubmit={handleSubmit}
    >
      <label htmlFor={enabledId} className="form-checkbox-label">
        <input
          id={enabledId}
          name={`${idPrefix}Enabled`}
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setSaved(false);
          }}
        />
        <span>
          <strong>{t(toggleLabelKey)}</strong>
          <small>{t(toggleHelpKey)}</small>
        </span>
      </label>

      {enabled ? (
        <div className="anniversary-reminder-config rule-reminder-config">
          <fieldset className="field-group">
            <legend>{t(daysHeadingKey)}</legend>
            <div className="anniversary-reminder-days">
              {dayPresets.map((preset) => (
                <label
                  key={preset.days}
                  className="anniversary-reminder-day-option"
                >
                  <input
                    type="checkbox"
                    checked={daysBefore.includes(preset.days)}
                    onChange={() => toggleDay(preset.days)}
                  />
                  <span>{t(preset.labelKey)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field-group">
            <label htmlFor={timeId}>{t(timeLabelKey)}</label>
            <input
              id={timeId}
              name={`${idPrefix}Time`}
              type="time"
              value={localTime}
              onChange={(event) => {
                setLocalTime(event.target.value);
                setSaved(false);
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="form-actions">
        <button type="submit" disabled={!isDirty || mutation.isPending}>
          {mutation.isPending
            ? t('profileIdentity.anniversaryReminderSaving')
            : t('profileIdentity.anniversaryReminderSave')}
        </button>
        {saved && !isDirty ? (
          <span className="relationship-saved-feedback" role="status">
            {t('profileIdentity.anniversaryReminderSaved')}
          </span>
        ) : null}
      </div>

      {mutation.error ? <ProblemState error={mutation.error} /> : null}
    </form>
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
      defaultDaysBefore={ANNIVERSARY_DEFAULT_DAYS}
      dayPresets={ANNIVERSARY_DAY_PRESETS}
      toggleLabelKey="profileIdentity.anniversaryReminderToggle"
      toggleHelpKey="profileIdentity.anniversaryReminderToggleHelp"
      daysHeadingKey="profileIdentity.anniversaryReminderDaysHeading"
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
      defaultDaysBefore={PARTNER_BIRTHDAY_DEFAULT_DAYS}
      dayPresets={PARTNER_BIRTHDAY_DAY_PRESETS}
      toggleLabelKey="profileIdentity.partnerBirthdayReminderToggle"
      toggleHelpKey="profileIdentity.partnerBirthdayReminderToggleHelp"
      daysHeadingKey="profileIdentity.partnerBirthdayReminderDaysHeading"
      timeLabelKey="profileIdentity.partnerBirthdayReminderTimeLabel"
      loadingKey="profileIdentity.partnerBirthdayReminderLoading"
    />
  );
}
