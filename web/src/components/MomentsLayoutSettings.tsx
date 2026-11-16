import { type DiaryLayout, useDiaryLayout } from '../client/useDiaryLayout';
import { useTranslation } from '../i18n';
import './MomentsLayoutSettings.css';

const OPTIONS: readonly DiaryLayout[] = ['album', 'compact'];

/**
 * One switch for how Momente look: the scrapbook Album or the classic calm
 * list. It governs Memories, Diary, Chapters and the rediscovery card on Us,
 * so the previous look can always be restored in one place. Per device.
 */
export function MomentsLayoutSettings() {
  const { t } = useTranslation();
  const [layout, setLayout] = useDiaryLayout();
  return (
    <section
      className="settings-section"
      aria-labelledby="moments-layout-title"
    >
      <h2 id="moments-layout-title">{t('momentsLayout.title')}</h2>
      <p className="settings-section-intro">{t('momentsLayout.intro')}</p>
      <div
        role="radiogroup"
        aria-labelledby="moments-layout-title"
        className="moments-layout-choices"
      >
        {OPTIONS.map((value) => (
          <label className="choice-row" key={value}>
            <input
              type="radio"
              name="moments-layout"
              value={value}
              checked={layout === value}
              onChange={() => setLayout(value)}
            />
            <span>
              <strong>{t(`momentsLayout.${value}.name`)}</strong>
              <small>{t(`momentsLayout.${value}.hint`)}</small>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
