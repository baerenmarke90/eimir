import { useId, useState } from 'react';
import { useTranslation } from '../i18n';
import './PlayModeChoice.css';

export type PlayMode = 'apart' | 'together';

/*
 * How a couple game is played (#2048): each partner on their own phone, at
 * their own pace, or together on one phone that is handed back and forth.
 * Shared by Who of us, Wish detective and Our moments so the choice reads the
 * same everywhere.
 */
export function PlayModeChoice({
  partnerName,
  starting = false,
  onStart,
}: {
  partnerName: string;
  starting?: boolean;
  onStart: (mode: PlayMode) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PlayMode>('apart');
  const legendId = useId();
  const options: { value: PlayMode; title: string; body: string }[] = [
    {
      value: 'apart',
      title: t('games.playMode.apart'),
      body: t('games.playMode.apartBody', { name: partnerName }),
    },
    {
      value: 'together',
      title: t('games.playMode.together'),
      body: t('games.playMode.togetherBody'),
    },
  ];
  return (
    <section className="play-mode" aria-labelledby={legendId}>
      <fieldset className="play-mode-options">
        <legend id={legendId} className="play-mode-legend">
          {t('games.playMode.legend')}
        </legend>
        {options.map((option) => (
          <label
            key={option.value}
            className={`play-mode-option${mode === option.value ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name={`${legendId}-mode`}
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
            />
            <span className="play-mode-glyph" aria-hidden="true">
              {option.value === 'apart' ? (
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <rect x="3" y="4" width="7" height="14" rx="2" />
                  <rect x="14" y="6" width="7" height="14" rx="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <rect x="7" y="3" width="10" height="18" rx="2" />
                </svg>
              )}
            </span>
            <span className="play-mode-text">
              <span className="play-mode-title">{option.title}</span>
              <span className="play-mode-body">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="play-mode-start"
        disabled={starting}
        onClick={() => onStart(mode)}
      >
        {starting ? t('games.playMode.starting') : t('games.playMode.start')}
      </button>
    </section>
  );
}
