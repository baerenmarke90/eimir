import { useTranslation } from '../i18n';
import { MemoryCreateTagsEnum } from '../api/generated/models/MemoryCreate';
import './MemoryTagChoices.css';

export const MEMORY_TAGS = [
  MemoryCreateTagsEnum.out_together,
  MemoryCreateTagsEnum.laughter,
  MemoryCreateTagsEnum.home,
  MemoryCreateTagsEnum.special_day,
] as const;

export type MemoryTag = (typeof MEMORY_TAGS)[number];

export function MemoryTagChoices({
  selected,
  onChange,
  disabled = false,
}: {
  selected: readonly string[];
  onChange: (tags: MemoryTag[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="memory-tag-choices" disabled={disabled}>
      <legend>{t('memory.tagsLabel')}</legend>
      <p className="field-help">{t('memory.tagsHelp')}</p>
      <div className="memory-tag-list">
        {MEMORY_TAGS.map((tag) => (
          <label className="memory-tag-choice" key={tag}>
            <input
              type="checkbox"
              checked={selected.includes(tag)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? ([...selected, tag] as MemoryTag[])
                    : (selected.filter(
                        (entry) => entry !== tag,
                      ) as MemoryTag[]),
                )
              }
            />
            <span>{t(`memory.tagLabels.${tag}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
