import type { ComponentProps, MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ChapterTimelineMarker } from '../api/generated/models/ChapterTimelineMarker';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { formatChapterPeriod } from '../client/chapterPresentation';
import type { DiaryEntry } from '../client/diaryEntries';
import { chapterDetailPath } from '../client/routes';
import { storyItemKey } from '../client/storyProduct';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { StoryList } from './StoryList';
import './ChapterExperience.css';

/** Chapter markers remain destinations between unchanged source-content previews. */
export function DiaryList({
  entries,
  onOpenChapter,
  ...props
}: Omit<ComponentProps<typeof StoryList>, 'items'> & {
  entries: DiaryEntry[];
  onOpenChapter?: (
    event: MouseEvent<HTMLAnchorElement>,
    chapter: ChapterTimelineMarker,
    to: string,
  ) => void;
}) {
  const { t } = useTranslation();
  const sections: Array<
    | { key: string; items: StoryItem[] }
    | { key: string; chapter: ChapterTimelineMarker }
  > = [];
  for (const entry of entries) {
    if (entry.type === 'chapter')
      sections.push({
        key: `chapter-${entry.chapter.id}`,
        chapter: entry.chapter,
      });
    else {
      const previous = sections.at(-1);
      if (previous && 'items' in previous) previous.items.push(entry.item);
      else
        sections.push({ key: storyItemKey(entry.item), items: [entry.item] });
    }
  }
  return (
    <div className="diary-sequence">
      {sections.map((section) =>
        'items' in section ? (
          <StoryList key={section.key} items={section.items} {...props} />
        ) : (
          <Link
            key={section.key}
            className="chapter-diary-marker"
            data-task-item-key={section.key}
            data-timeline-reveal-key={section.key}
            to={chapterDetailPath(section.chapter.id)}
            onClick={(event) =>
              onOpenChapter?.(
                event,
                section.chapter,
                chapterDetailPath(section.chapter.id),
              )
            }
          >
            <EimirIcon name="kapitel" />
            <span className="chapter-diary-copy">
              <span className="chapter-diary-kind">
                {t('m5s3.chapter.heading')}
              </span>
              <strong>{section.chapter.title}</strong>
              <span className="chapter-diary-period">
                {formatChapterPeriod(section.chapter, t, resolvedLocale())}
              </span>
            </span>
          </Link>
        ),
      )}
    </div>
  );
}
