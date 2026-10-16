import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { normalizeClientError } from '../client/problemDetails';
import { chapterDetailPath, STORY_CHAPTERS_ROUTE } from '../client/routes';
import {
  dateFromInput,
  loadAllPlaces,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import './SharedPlanningPages.css';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function ChapterCreatePage({
  apis,
  spaceId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const placesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeOptions(spaceId),
    queryFn: () => apiCall(() => loadAllPlaces(apis, spaceId)),
    staleTime: 30_000,
    retry: false,
  });

  const createChapter = useMutation({
    mutationFn: (values: {
      title: string;
      description?: string;
      startOn?: Date;
      endOn?: Date;
      placeId?: string;
    }) =>
      apiCall(() =>
        apis.chapters.createChapter({ spaceId, chapterCreate: values }),
      ),
    onSuccess: async (chapter) => {
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'chapters', spaceId],
      });
      navigate(chapterDetailPath(chapter.id), { replace: true });
    },
  });

  function submitChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description')).trim();
    const startOn = dateFromInput(String(data.get('startOn')).trim());
    const endOn = dateFromInput(String(data.get('endOn')).trim());
    const placeId = String(data.get('placeId')).trim();
    createChapter.mutate({
      title: String(data.get('title')).trim(),
      description: description || undefined,
      startOn: startOn ?? undefined,
      endOn: endOn ?? undefined,
      placeId: placeId || undefined,
    });
  }

  return (
    <div className="page page-reading create-page">
      <PageHeader
        before={
          <Link className="back-link" to={STORY_CHAPTERS_ROUTE}>
            {t('m5s3.common.backToChapters')}
          </Link>
        }
        eyebrow={t('m5s3.chapter.createEyebrow')}
        title={t('m5s3.chapter.createHeading')}
        description={t('m5s3.chapter.createIntro')}
        className="create-heading"
      />

      <section
        className="immersive-create-card"
        aria-labelledby="chapter-form-heading"
      >
        <h2 id="chapter-form-heading" className="sr-only">
          {t('m5s3.chapter.formAria')}
        </h2>
        <form onSubmit={submitChapter} className="immersive-create-form">
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
            />
          </div>

          <details className="immersive-create-details">
            <summary>{t('m5s3.chapter.addMoreDetails')}</summary>
            <div className="immersive-create-details-content">
              <div className="field-group">
                <label htmlFor="chapter-desc">
                  {t('m5s3.common.description')}
                </label>
                <textarea id="chapter-desc" name="description" rows={3} />
              </div>
              <div className="planning-coordinate-grid">
                <div className="field-group">
                  <label htmlFor="chapter-start">
                    {t('m5s3.chapter.startOn')}
                  </label>
                  <input id="chapter-start" name="startOn" type="date" />
                </div>
                <div className="field-group">
                  <label htmlFor="chapter-end">{t('m5s3.chapter.endOn')}</label>
                  <input id="chapter-end" name="endOn" type="date" />
                </div>
              </div>
              <div className="field-group">
                <label htmlFor="chapter-place">{t('m5s3.common.place')}</label>
                <select
                  id="chapter-place"
                  name="placeId"
                  defaultValue=""
                  disabled={placesQuery.isLoading}
                >
                  <option value="">{t('m5s3.common.noPlace')}</option>
                  {(placesQuery.data ?? []).map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </details>

          <div className="form-actions">
            <Link
              className="button-link secondary-link"
              to={STORY_CHAPTERS_ROUTE}
            >
              {t('common.cancel')}
            </Link>
            <button type="submit" disabled={createChapter.isPending}>
              {createChapter.isPending
                ? t('m5s3.common.saving')
                : t('m5s3.common.save')}
            </button>
          </div>
          {createChapter.error ? (
            <ProblemState error={createChapter.error} />
          ) : null}
        </form>
      </section>
    </div>
  );
}
