/**
 * The garden book's small settings area (#1907 H3 follow-up): soft sounds
 * for this device and, in the native app only, a light vibration. Both stay
 * off until someone turns them on here. The vibration switch is hidden
 * outside the native app; that follows the runtime platform, not the width.
 */

import type { GardenFeedback } from '../client/gardenFeedback';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';
import './GardenFeedbackSettings.css';

export function GardenFeedbackSettings({
  feedback,
}: {
  feedback: GardenFeedback;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="garden-feedback-settings"
      aria-labelledby="garden-feedback-title"
      data-testid="garden-feedback-settings"
    >
      <h3 id="garden-feedback-title">
        {t('games.garden.story.feedback.title')}
      </h3>
      <div className="garden-feedback-list">
        <PreferenceSwitch
          label={t('games.garden.story.feedback.sound')}
          description={t('games.garden.story.feedback.soundHint')}
          checked={feedback.sound}
          onCheckedChange={feedback.setSound}
        />
        {feedback.native ? (
          <PreferenceSwitch
            label={t('games.garden.story.feedback.vibration')}
            description={t('games.garden.story.feedback.vibrationHint')}
            checked={feedback.vibration}
            onCheckedChange={feedback.setVibration}
          />
        ) : null}
      </div>
    </section>
  );
}
