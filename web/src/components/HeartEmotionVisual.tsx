import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import { useTranslation } from '../i18n';
import './HeartEmotionVisual.css';

export type HeartEmotionValue =
  (typeof HeartEmotion)[keyof typeof HeartEmotion];

export const HEART_EMOTIONS = Object.values(
  HeartEmotion,
) as HeartEmotionValue[];

function EmotionIcon({ emotion }: { emotion: HeartEmotionValue }) {
  switch (emotion) {
    case HeartEmotion.LOVED:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 20.6 4.7 13.8C1.9 11.2 2 6.9 4.8 5.1c2.3-1.5 5.2-.9 7.2 1.4 2-2.3 4.9-2.9 7.2-1.4 2.8 1.8 2.9 6.1.1 8.7L12 20.6Z"
            fill="currentColor"
          />
        </svg>
      );
    case HeartEmotion.SEEN:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M2.7 12s3.3-5.2 9.3-5.2 9.3 5.2 9.3 5.2-3.3 5.2-9.3 5.2S2.7 12 2.7 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" />
        </svg>
      );
    case HeartEmotion.APPRECIATED:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="m12 2.8 1.6 5.6 5.6 1.6-5.6 1.6-1.6 5.6-1.6-5.6L4.8 10l5.6-1.6L12 2.8Z"
            fill="currentColor"
          />
          <path
            d="m18.2 14.2.8 2.6 2.6.8-2.6.8-.8 2.6-.8-2.6-2.6-.8 2.6-.8.8-2.6Z"
            fill="currentColor"
            opacity=".72"
          />
        </svg>
      );
    case HeartEmotion.SUPPORTED:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4.2 12.2c2.2 0 3.7 1 5.1 2.5l2.1 2.1c.4.4 1 .4 1.4 0l2.1-2.1c1.4-1.5 2.9-2.5 5.1-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M12 13.1 9 10.4c-1.1-1-1.1-2.7 0-3.6.9-.8 2.2-.6 3 .4.8-1 2.1-1.2 3-.4 1.1.9 1.1 2.6 0 3.6l-3 2.7Z"
            fill="currentColor"
          />
          <path
            d="M4.1 16.6c2.4.1 4.1 1 5.8 2.4M19.9 16.6c-2.4.1-4.1 1-5.8 2.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case HeartEmotion.GRATEFUL:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="3.1" fill="currentColor" />
          <path
            d="M12 3.1v3M12 17.9v3M3.1 12h3M17.9 12h3M5.7 5.7l2.1 2.1M16.2 16.2l2.1 2.1M18.3 5.7l-2.1 2.1M7.8 16.2l-2.1 2.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case HeartEmotion.HAPPY:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="7.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <circle cx="9.2" cy="10.2" r=".9" fill="currentColor" />
          <circle cx="14.8" cy="10.2" r=".9" fill="currentColor" />
          <path
            d="M8.7 13.7c.9 1.4 2 2.1 3.3 2.1s2.4-.7 3.3-2.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M12 1.8v2M12 20.2v2M1.8 12h2M20.2 12h2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export function HeartEmotionBadge({
  emotion,
  variant = 'compact',
  className = '',
}: {
  emotion: HeartEmotionValue;
  variant?: 'compact' | 'detail';
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t(`heartEmotion.${emotion}`);

  return (
    <span
      className={`heart-emotion-badge heart-emotion-badge--${variant} ${className}`.trim()}
      data-emotion={emotion}
    >
      <span className="heart-emotion-icon" aria-hidden="true">
        <EmotionIcon emotion={emotion} />
      </span>
      <span className="sr-only">{t('heartMomentProduct.emotionLabel')}: </span>
      <span className="heart-emotion-label">{label}</span>
    </span>
  );
}

export function HeartEmotionPicker({
  name = 'emotion',
  defaultValue = HeartEmotion.LOVED,
  legend,
  idPrefix = 'heart-emotion',
  className = '',
}: {
  name?: string;
  defaultValue?: HeartEmotionValue;
  legend: string;
  idPrefix?: string;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <fieldset className={`heart-emotion-picker ${className}`.trim()}>
      <legend>{legend}</legend>
      <div className="heart-emotion-picker-grid">
        {HEART_EMOTIONS.map((emotion) => {
          const id = `${idPrefix}-${emotion.toLowerCase()}`;
          return (
            <label
              key={emotion}
              className="heart-emotion-choice"
              data-emotion={emotion}
              htmlFor={id}
            >
              <input
                id={id}
                className="heart-emotion-choice-input"
                type="radio"
                name={name}
                value={emotion}
                defaultChecked={emotion === defaultValue}
              />
              <span className="heart-emotion-choice-visual">
                <span className="heart-emotion-icon" aria-hidden="true">
                  <EmotionIcon emotion={emotion} />
                </span>
                <span className="heart-emotion-choice-label">
                  {t(`heartEmotion.${emotion}`)}
                </span>
                <span className="heart-emotion-choice-check" aria-hidden="true">
                  ✓
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
