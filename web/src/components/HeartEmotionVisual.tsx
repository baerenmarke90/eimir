import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import './HeartEmotionVisual.css';

export type HeartEmotionValue =
  (typeof HeartEmotion)[keyof typeof HeartEmotion];

export const HEART_EMOTIONS = Object.values(
  HeartEmotion,
) as HeartEmotionValue[];

const EMOTION_ICONS: Record<HeartEmotionValue, EimirIconName> = {
  LOVED: 'heart',
  SEEN: 'eye',
  APPRECIATED: 'sparkle',
  SUPPORTED: 'heart-in-hands',
  GRATEFUL: 'sun',
  HAPPY: 'smile-sun',
};

function EmotionIcon({ emotion }: { emotion: HeartEmotionValue }) {
  return (
    <EimirIcon
      name={EMOTION_ICONS[emotion]}
      variant={emotion === HeartEmotion.LOVED ? 'filled' : 'outline'}
    />
  );
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
  const accessibleLabel = `${t('heartMomentProduct.emotionLabel')}: ${label}`;

  return (
    <span
      className={`heart-emotion-badge heart-emotion-badge--${variant} ${className}`.trim()}
      data-emotion={emotion}
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
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
  compact = false,
  onChange,
}: {
  compact?: boolean;
  onChange?: (emotion: HeartEmotionValue) => void;
  name?: string;
  defaultValue?: HeartEmotionValue;
  legend: string;
  idPrefix?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(defaultValue);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const form = fieldset.current?.closest('form');
    const reset = () => {
      setSelected(defaultValue);
      onChange?.(defaultValue);
    };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [defaultValue, onChange]);
  const choices = (
    <fieldset
      ref={fieldset}
      className={`heart-emotion-picker ${className}`.trim()}
    >
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
                onChange={() => {
                  setSelected(emotion);
                  onChange?.(emotion);
                }}
              />
              <span className="heart-emotion-choice-visual">
                <span className="heart-emotion-icon" aria-hidden="true">
                  <EmotionIcon emotion={emotion} />
                </span>
                <span className="heart-emotion-choice-label">
                  {t(`heartEmotion.${emotion}`)}
                </span>
                <span className="heart-emotion-choice-check" aria-hidden="true">
                  <EimirIcon name="check" className="inline-icon" />
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
  return compact ? (
    <details className="heart-emotion-disclosure">
      <summary>
        <span aria-hidden="true">{legend}</span>
        <span className="heart-emotion-summary-value">
          <HeartEmotionBadge emotion={selected} />
          <EimirIcon name="chevron-right" />
        </span>
      </summary>
      {choices}
    </details>
  ) : (
    choices
  );
}

/** Feeling color follows the active surface and releases browser chrome on exit. */
export function HeartEmotionSurface({
  emotion,
  children,
  className = '',
}: {
  emotion: HeartEmotionValue;
  children: ReactNode;
  className?: string;
}) {
  const surface = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = surface.current;
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!element || element.dataset.heartEmotion !== emotion) return;
    const previousSurface = document.documentElement.style.getPropertyValue(
      '--active-heart-emotion-surface',
    );
    const previousAccent = document.documentElement.style.getPropertyValue(
      '--active-heart-emotion-accent',
    );
    const update = () => {
      const color = getComputedStyle(element)
        .getPropertyValue('--heart-emotion-surface')
        .trim();
      if (color) {
        if (meta) meta.content = color;
        document.documentElement.style.setProperty(
          '--active-heart-emotion-surface',
          color,
        );
        document.documentElement.style.setProperty(
          '--active-heart-emotion-accent',
          getComputedStyle(element)
            .getPropertyValue('--heart-emotion-accent')
            .trim(),
        );
      }
    };
    update();
    const theme = new MutationObserver(update);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      theme.disconnect();
      if (previousSurface)
        document.documentElement.style.setProperty(
          '--active-heart-emotion-surface',
          previousSurface,
        );
      else
        document.documentElement.style.removeProperty(
          '--active-heart-emotion-surface',
        );
      if (previousAccent)
        document.documentElement.style.setProperty(
          '--active-heart-emotion-accent',
          previousAccent,
        );
      else
        document.documentElement.style.removeProperty(
          '--active-heart-emotion-accent',
        );
      const background = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-background')
        .trim();
      if (background && meta) meta.content = background;
    };
  }, [emotion]);
  return (
    <div
      ref={surface}
      className={`heart-emotion-page heart-emotion-compose ${className}`.trim()}
      data-heart-emotion={emotion}
    >
      {children}
    </div>
  );
}
