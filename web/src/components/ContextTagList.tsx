import { Link } from 'react-router-dom';
import { SEARCH_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { HEART_MOMENT_TAGS } from './HeartMomentTagChoices';
import { MEMORY_TAGS } from './MemoryTagChoices';
import './MemoryTagChoices.css';

export function ContextTagList({
  tags,
  presentation,
  labelForTag,
}: {
  tags?: readonly string[];
  presentation?: 'composer';
  labelForTag?: (tag: string) => string;
}) {
  const { t } = useTranslation();
  if (!tags?.length) return null;
  return (
    <ul className="memory-tag-summary" aria-label={t('contextTags.label')}>
      {tags.map((tag) => {
        const label =
          labelForTag?.(tag) ??
          ((MEMORY_TAGS as readonly string[]).includes(tag)
            ? t(`memory.tagLabels.${tag}`)
            : (HEART_MOMENT_TAGS as readonly string[]).includes(tag)
              ? t(`heartMomentProduct.tagLabels.${tag}`)
              : tag);
        return (
          <li key={tag} className="memory-tag">
            <Link
              className="memory-tag-link"
              to={SEARCH_ROUTE}
              state={{ selectedTag: tag }}
              aria-label={t('contextTags.showTagged', { tag: label })}
            >
              {presentation === 'composer' ? <EimirIcon name="tag" /> : null}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
