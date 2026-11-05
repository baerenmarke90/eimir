import { useTranslation } from '../i18n';
import { MEMORY_TAGS } from './MemoryTagChoices';
import './MemoryTagChoices.css';

export function ContextTagList({ tags }: { tags?: readonly string[] }) {
  const { t } = useTranslation();
  if (!tags?.length) return null;
  return (
    <ul className="memory-tag-summary" aria-label={t('contextTags.label')}>
      {tags.map((tag) => (
        <li key={tag} className="memory-tag">
          {(MEMORY_TAGS as readonly string[]).includes(tag)
            ? t(`memory.tagLabels.${tag}`)
            : tag}
        </li>
      ))}
    </ul>
  );
}
