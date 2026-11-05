import { Link, useNavigate } from 'react-router-dom';
import type { ChapterPeriodSummary } from '../api/generated/models/ChapterPeriodSummary';
import { formatChapterPeriod } from '../client/chapterPresentation';
import { chapterDetailPath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './ChapterExperience.css';

export function DiaryChapterPeriods({
  chapters,
  month,
  loadedPageCount = 1,
}: {
  chapters: ChapterPeriodSummary[];
  month: string;
  loadedPageCount?: number;
}) {
  const { t } = useTranslation();
  const { captureOrigin } = useTaskOrigin();
  const navigate = useNavigate();
  if (!chapters.length) return null;
  return (
    <ul
      className="diary-chapter-periods"
      aria-label={t('m5s3.chapter.ongoing')}
    >
      {chapters.map((chapter) => {
        const key = `chapter-period-${month}-${chapter.id}`;
        return (
          <li key={chapter.id}>
            <Link
              to={chapterDetailPath(chapter.id)}
              data-task-item-key={key}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                const taskOriginKey = captureOrigin({
                  selectedKey: key,
                  loadedPageCount,
                  selectedOffset:
                    event.currentTarget.getBoundingClientRect().top,
                });
                if (!taskOriginKey) return;
                event.preventDefault();
                void navigate(chapterDetailPath(chapter.id), {
                  state: { taskOriginKey },
                });
              }}
            >
              <EimirIcon name="kapitel" />
              <span>
                <strong>{chapter.title}</strong>
                <span>{formatChapterPeriod(chapter, t, resolvedLocale())}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
