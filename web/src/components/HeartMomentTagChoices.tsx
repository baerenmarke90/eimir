import { HeartMomentCreateTagsEnum } from '../api/generated/models/HeartMomentCreate';
import { useTranslation } from '../i18n';
import './MemoryTagChoices.css';

export const HEART_MOMENT_TAGS = [
  HeartMomentCreateTagsEnum.everyday,
  HeartMomentCreateTagsEnum.out_together,
  HeartMomentCreateTagsEnum.home,
  HeartMomentCreateTagsEnum.special_day,
] as const;

export type HeartMomentTag = (typeof HEART_MOMENT_TAGS)[number];

export function HeartMomentTagChoices({
  selected = [],
}: {
  selected?: readonly string[];
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="memory-tag-choices">
      <legend>{t('heartMomentProduct.tagsLabel')}</legend>
      <p className="field-help">{t('heartMomentProduct.tagsHelp')}</p>
      <div className="memory-tag-list">
        {HEART_MOMENT_TAGS.map((tag) => (
          <label className="memory-tag-choice" key={tag}>
            <input
              type="checkbox"
              name="tags"
              value={tag}
              defaultChecked={selected.includes(tag)}
            />
            <span>{t(`heartMomentProduct.tagLabels.${tag}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
