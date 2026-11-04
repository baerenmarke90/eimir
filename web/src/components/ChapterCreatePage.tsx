import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { assertOnlineWrite } from '../client/connectivity';
import { normalizeClientError } from '../client/problemDetails';
import { chapterDetailPath, STORY_CHAPTERS_ROUTE } from '../client/routes';
import {
  dateFromInput,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { invalidateChapterProjections } from '../client/chapterQueries';
import { useTranslation } from '../i18n';
import { ChapterContextFields, type ChapterDraft } from './ChapterFields';
import { PageHeader } from './PageHeader';
import { PlanningDiscardConfirmation } from './PlanningEditorLifecycle';
import { ProblemState } from './ProblemState';
import { TaskBackButton } from './TaskBackButton';
import './SharedPlanningPages.css';
import './ChapterExperience.css';

type Props = { apis: SharedPlanningApis; spaceId: string; accountId?: string };

export function ChapterCreatePage(props: Props) {
  return (
    <ChapterCreateTask key={`${props.accountId}:${props.spaceId}`} {...props} />
  );
}

function ChapterCreateTask({ apis, spaceId, accountId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const [draft, setDraft] = useState<ChapterDraft>({
    title: '',
    description: '',
    startOn: '',
    endOn: '',
    placeId: '',
  });
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [placePending, setPlacePending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lifecycle = useTaskEditorLifecycle({
    isDirty: Object.values(draft).some(Boolean),
    isCloseBlocked: pending || placePending,
    onClose: () => requestReturn(originKey, STORY_CHAPTERS_ROUTE),
  });
  const change = (values: Partial<ChapterDraft>) =>
    setDraft((current) => ({ ...current, ...values }));

  async function save() {
    if (inFlight.current || placePending || !draft.title.trim()) return;
    const ownsTask = lifecycle.captureOwnership();
    if (!ownsTask()) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      assertOnlineWrite();
      const chapter = await apis.chapters.createChapter({
        spaceId,
        chapterCreate: {
          title: draft.title.trim(),
          description: draft.description.trim() || undefined,
          startOn: dateFromInput(draft.startOn),
          endOn: dateFromInput(draft.endOn),
          placeId: draft.placeId || undefined,
        },
      });
      if (!ownsTask()) return;
      await invalidateChapterProjections(client, spaceId, accountId);
      if (!ownsTask()) return;
      lifecycle.closeConfirmed(
        () =>
          void navigate(chapterDetailPath(chapter.id), {
            replace: true,
            state: { taskOriginKey: originKey, saved: true },
          }),
      );
    } catch (failure) {
      const problem = await normalizeClientError(failure);
      if (ownsTask()) setError(problem);
    } finally {
      inFlight.current = false;
      if (ownsTask()) setPending(false);
    }
  }

  return (
    <div className="page page-reading create-page chapter-page">
      <PageHeader
        before={
          <TaskBackButton
            disabled={pending || placePending}
            onClick={lifecycle.requestClose}
          />
        }
        title={t('m5s3.chapter.createHeading')}
        className="create-heading"
      />
      {lifecycle.showDiscardConfirm ? (
        <PlanningDiscardConfirmation
          onKeepEditing={lifecycle.keepEditing}
          onDiscard={lifecycle.closeConfirmed}
        />
      ) : null}
      <section
        className="immersive-create-card"
        aria-labelledby="chapter-form-heading"
      >
        <h2 id="chapter-form-heading" className="sr-only">
          {t('m5s3.chapter.formAria')}
        </h2>
        <form
          className="immersive-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="immersive-create-hero">
            <label htmlFor="chapter-name" className="sr-only">
              {t('m5s3.common.title')}
            </label>
            <input
              id="chapter-name"
              name="title"
              required
              maxLength={200}
              placeholder={t('m5s3.common.title')}
              className="immersive-create-title"
              value={draft.title}
              disabled={pending}
              onChange={(event) => change({ title: event.target.value })}
            />
          </div>
          <div className="field-group">
            <label htmlFor="chapter-desc">{t('m5s3.common.description')}</label>
            <textarea
              id="chapter-desc"
              name="description"
              rows={4}
              placeholder={t('m5s3.chapter.descriptionPlaceholder')}
              value={draft.description}
              disabled={pending}
              onChange={(event) => change({ description: event.target.value })}
            />
          </div>
          <details className="immersive-create-details">
            <summary>{t('m5s3.chapter.addMoreDetails')}</summary>
            <div className="immersive-create-details-content">
              <ChapterContextFields
                apis={apis}
                spaceId={spaceId}
                draft={draft}
                onChange={change}
                disabled={pending}
                captureAdmission={lifecycle.captureOwnership}
                onPendingChange={setPlacePending}
              />
            </div>
          </details>
          {error ? <ProblemState error={error} /> : null}
          <div className="form-actions">
            <button
              type="button"
              className="tertiary"
              disabled={pending || placePending}
              onClick={lifecycle.requestClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={pending || placePending || !draft.title.trim()}
            >
              {t(pending ? 'm5s3.common.saving' : 'm5s3.common.save')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
