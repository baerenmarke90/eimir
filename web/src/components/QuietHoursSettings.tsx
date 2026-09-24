import { type FormEvent, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { QuietHoursUpdate } from '../api/generated/models/QuietHoursUpdate';
import type { QuietHoursView } from '../api/generated/models/QuietHoursView';
import { normalizeClientError } from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';

const DEFAULT_START = '22:00';
const DEFAULT_END = '07:00';

export function QuietHoursSettings({
  quietHours,
  notificationsApi,
  onUpdated,
}: {
  quietHours: QuietHoursView;
  notificationsApi: NotificationsApi;
  onUpdated: (value: QuietHoursView) => void;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(quietHours.enabled);
  const [start, setStart] = useState(
    quietHours.start?.slice(0, 5) ?? DEFAULT_START,
  );
  const [end, setEnd] = useState(quietHours.end?.slice(0, 5) ?? DEFAULT_END);
  const [saved, setSaved] = useState(false);
  const persistedStart = quietHours.start?.slice(0, 5) ?? DEFAULT_START;
  const persistedEnd = quietHours.end?.slice(0, 5) ?? DEFAULT_END;
  const isDirty =
    enabled !== quietHours.enabled ||
    (enabled && (start !== persistedStart || end !== persistedEnd));
  const invalid = enabled && (!start || !end || start === end);

  useEffect(() => {
    setEnabled(quietHours.enabled);
    setStart(quietHours.start?.slice(0, 5) ?? DEFAULT_START);
    setEnd(quietHours.end?.slice(0, 5) ?? DEFAULT_END);
  }, [quietHours.enabled, quietHours.start, quietHours.end]);

  useEffect(() => {
    if (!isDirty || typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  const mutation = useMutation({
    mutationFn: async (update: QuietHoursUpdate) => {
      try {
        return await notificationsApi.updateOwnQuietHours({
          quietHoursUpdate: update,
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (updated) => {
      onUpdated(updated);
      setSaved(true);
    },
  });

  function edit(update: () => void) {
    update();
    setSaved(false);
    mutation.reset();
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || invalid || mutation.isPending) return;
    mutation.mutate({
      enabled,
      start: enabled ? start : null,
      end: enabled ? end : null,
    });
  }

  return (
    <form
      className="quiet-hours-settings"
      aria-labelledby="quiet-hours-title"
      onSubmit={save}
      noValidate
    >
      <div className="quiet-hours-intro">
        <h3 id="quiet-hours-title">
          {t('notificationSettings.quietHoursTitle')}
        </h3>
        <p>{t('notificationSettings.quietHoursIntro')}</p>
        <p className="form-hint">
          {t('notificationSettings.quietHoursTimezone', {
            timeZone: quietHours.timeZone,
          })}
        </p>
        <p className="form-hint">
          {quietHours.enabled
            ? t('notificationSettings.quietHoursActive', {
                start: persistedStart,
                end: persistedEnd,
              })
            : t('notificationSettings.quietHoursOff')}
        </p>
      </div>

      <PreferenceSwitch
        label={t('notificationSettings.quietHoursEnable')}
        checked={enabled}
        disabled={mutation.isPending}
        onCheckedChange={(value) => edit(() => setEnabled(value))}
      />

      {enabled && (
        <div className="quiet-hours-times">
          <div className="field-group">
            <label htmlFor="quiet-hours-start">
              {t('notificationSettings.quietHoursStart')}
            </label>
            <input
              id="quiet-hours-start"
              name="quietHoursStart"
              type="time"
              required
              value={start}
              aria-describedby={invalid ? 'quiet-hours-error' : undefined}
              aria-invalid={invalid || undefined}
              disabled={mutation.isPending}
              onChange={(event) => edit(() => setStart(event.target.value))}
            />
          </div>
          <div className="field-group">
            <label htmlFor="quiet-hours-end">
              {t('notificationSettings.quietHoursEnd')}
            </label>
            <input
              id="quiet-hours-end"
              name="quietHoursEnd"
              type="time"
              required
              value={end}
              aria-describedby={invalid ? 'quiet-hours-error' : undefined}
              aria-invalid={invalid || undefined}
              disabled={mutation.isPending}
              onChange={(event) => edit(() => setEnd(event.target.value))}
            />
          </div>
        </div>
      )}

      {invalid && (
        <p id="quiet-hours-error" className="form-error" role="alert">
          {t('notificationSettings.quietHoursInvalid')}
        </p>
      )}
      <div className="form-actions">
        <button
          type="submit"
          disabled={!isDirty || invalid || mutation.isPending}
        >
          {mutation.isPending
            ? t('notificationSettings.quietHoursSaving')
            : t('notificationSettings.quietHoursSave')}
        </button>
        <span
          role={saved || isDirty ? 'status' : undefined}
          aria-live={saved || isDirty ? 'polite' : undefined}
          className="relationship-saved-feedback"
        >
          {saved && !isDirty
            ? t('notificationSettings.quietHoursSaved')
            : isDirty
              ? t('notificationSettings.quietHoursUnsaved')
              : null}
        </span>
      </div>
      {mutation.error && (
        <p className="form-error" role="alert">
          {t('notificationSettings.quietHoursFailed')}
        </p>
      )}
    </form>
  );
}
