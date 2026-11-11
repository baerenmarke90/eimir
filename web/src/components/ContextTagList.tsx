import { EimirIcon } from './EimirIcon';
import { useTranslation } from '../i18n';
import { MEMORY_TAGS } from './MemoryTagChoices';
import './MemoryTagChoices.css';

export function ContextTagList({
  tags,
  presentation,
}: {
  tags?: readonly string[];
  presentation?: 'composer';
}) {
  const { t } = useTranslation();
  if (!tags?.length) return null;
  return (
    <ul className="memory-tag-summary" aria-label={t('contextTags.label')}>
      {tags.map((tag) => (
        <li key={tag} className="memory-tag">
          {presentation === 'composer' ? <EimirIcon name="tag" /> : null}
          {(MEMORY_TAGS as readonly string[]).includes(tag)
            ? t(`memory.tagLabels.${tag}`)
            : tag}
        </li>
      ))}
    </ul>
  );
}
