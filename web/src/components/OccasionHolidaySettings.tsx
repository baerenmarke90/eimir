import { useOccasionHolidayPreference } from '../client/occasionHolidayPreferences';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';

export function OccasionHolidaySettings({
  instance,
  accountId,
  spaceId,
}: {
  instance: string;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const preference = useOccasionHolidayPreference({
    instance,
    accountId,
    spaceId,
  });

  return (
    <section
      className="settings-section occasion-holiday-settings"
      aria-labelledby="occasion-holiday-settings-heading"
    >
      <div className="settings-section-head">
        <h2 id="occasion-holiday-settings-heading">
          {t('importantDates.holidaySettings.title')}
        </h2>
        <p className="settings-section-intro">
          {t('importantDates.holidaySettings.intro')}
        </p>
      </div>
      <PreferenceSwitch
        label={t('importantDates.holidaySettings.toggle')}
        description={t('importantDates.holidaySettings.description')}
        checked={preference.enabled}
        onCheckedChange={preference.setEnabled}
      />
      <p className="settings-section-intro occasion-holiday-device-note">
        {t('importantDates.holidaySettings.deviceNote')}
      </p>
    </section>
  );
}
