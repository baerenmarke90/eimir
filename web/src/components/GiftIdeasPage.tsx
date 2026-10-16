import { type FormEvent, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import type { GiftIdeaDetail } from '../api/generated/models/GiftIdeaDetail';
import { GiftIdeaStatus } from '../api/generated/models/GiftIdeaStatus';
import {
  PRIVATE_GIFT_IDEAS_PATH,
  privateApiCall,
  privateAreaQueryKeys,
  privateGiftIdeaEditPath,
  privateGiftIdeaPath,
} from '../client/privateArea';
import { resolvedLocale, useTranslation } from '../i18n';
import { NativeDateField } from './NativeDateField';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import {
  DeleteConfirmation,
  LoadMoreButton,
  PrivateAreaBackToHub,
  PrivateAreaDetailBack,
  PrivateEditorDiscardSheet,
  usePrivateAreaTaskContext,
  usePrivateTaskEditorLifecycle,
} from './PrivateAreaLayout';
import { UiState } from './UiState';
import { useRequiredTitleValidation } from './useRequiredTitleValidation';

const PAGE_SIZE = 20;
const GIFT_STATUSES = Object.values(GiftIdeaStatus);

type Props = {
  api: PrivateAreaApi;
  accountId: string;
  spaceId: string;
};

function dateInputValue(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

function optionalText(data: FormData, name: string): string | null {
  const value = String(data.get(name) || '').trim();
  return value || null;
}

function useGiftIdea(api: PrivateAreaApi, accountId: string, spaceId: string) {
  const { giftIdeaId } = useParams();
  const query = useQuery({
    queryKey: privateAreaQueryKeys.giftIdea(
      accountId,
      spaceId,
      giftIdeaId ?? 'missing',
    ),
    queryFn: () => {
      if (!giftIdeaId) throw new Error('Missing gift idea route parameter.');
      return privateApiCall(() => api.getGiftIdea({ spaceId, giftIdeaId }));
    },
    enabled: Boolean(giftIdeaId),
    retry: false,
  });
  return { giftIdeaId, query };
}

function GiftIdeaFields({
  giftIdea,
  includeStatus = false,
  titleValidation,
}: {
  giftIdea?: GiftIdeaDetail;
  includeStatus?: boolean;
  titleValidation: ReturnType<typeof useRequiredTitleValidation>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="field-group">
        <label htmlFor="gift-title">{t('privateArea.gifts.titleLabel')}</label>
        <input
          ref={titleValidation.inputRef}
          id="gift-title"
          name="title"
          required
          maxLength={200}
          defaultValue={giftIdea?.title ?? ''}
          aria-invalid={titleValidation.invalid || undefined}
          aria-describedby={
            titleValidation.invalid ? 'gift-title-error' : undefined
          }
          onChange={(event) =>
            titleValidation.handleChange(event.currentTarget.value)
          }
        />
        {titleValidation.invalid ? (
          <p id="gift-title-error" className="status status-error" role="alert">
            {t('privateArea.titleRequired')}
          </p>
        ) : null}
      </div>
      <div className="field-group">
        <label htmlFor="gift-description">
          {t('privateArea.gifts.descriptionLabel')}
        </label>
        <textarea
          id="gift-description"
          name="description"
          rows={5}
          defaultValue={giftIdea?.description ?? ''}
        />
      </div>
      <div className="private-area-field-grid">
        <div className="field-group">
          <label htmlFor="gift-recipient">
            {t('privateArea.gifts.recipientLabel')}
          </label>
          <input
            id="gift-recipient"
            name="recipient"
            maxLength={200}
            defaultValue={giftIdea?.recipient ?? ''}
          />
        </div>
        <div className="field-group">
          <label htmlFor="gift-occasion">
            {t('privateArea.gifts.occasionLabel')}
          </label>
          <input
            id="gift-occasion"
            name="occasion"
            maxLength={200}
            defaultValue={giftIdea?.occasion ?? ''}
          />
        </div>
        <NativeDateField
          id="gift-target-on"
          name="targetOn"
          label={t('privateArea.gifts.targetOnLabel')}
          defaultValue={dateInputValue(giftIdea?.targetOn ?? null)}
        />
        <div className="field-group">
          <label htmlFor="gift-price">
            {t('privateArea.gifts.priceLabel')}
          </label>
          <input
            id="gift-price"
            name="priceText"
            maxLength={100}
            defaultValue={giftIdea?.priceText ?? ''}
          />
        </div>
      </div>
      <div className="field-group">
        <label htmlFor="gift-url">{t('privateArea.gifts.urlLabel')}</label>
        <input
          id="gift-url"
          name="url"
          type="url"
          maxLength={2048}
          defaultValue={giftIdea?.url ?? ''}
        />
        <p className="field-help">{t('privateArea.gifts.urlHelp')}</p>
      </div>
      {includeStatus ? (
        <div className="field-group">
          <label htmlFor="gift-status">
            {t('privateArea.gifts.statusLabel')}
          </label>
          <select
            id="gift-status"
            name="status"
            defaultValue={giftIdea?.status}
          >
            {GIFT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`privateArea.gifts.status.${status}`)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <label className="private-area-check" htmlFor="gift-pinned">
        <input
          id="gift-pinned"
          name="pinned"
          type="checkbox"
          defaultChecked={giftIdea?.pinned ?? false}
        />
        <span>{t('privateArea.gifts.pinnedLabel')}</span>
      </label>
    </>
  );
}

function giftValues(data: FormData) {
  const targetOn = String(data.get('targetOn') || '');
  return {
    title: String(data.get('title') || '').trim(),
    description: optionalText(data, 'description'),
    recipient: optionalText(data, 'recipient'),
    occasion: optionalText(data, 'occasion'),
    targetOn: targetOn ? new Date(`${targetOn}T00:00:00Z`) : null,
    priceText: optionalText(data, 'priceText'),
    url: optionalText(data, 'url'),
    pinned: data.get('pinned') === 'on',
  };
}

export function GiftIdeasListPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: privateAreaQueryKeys.giftIdeas(accountId, spaceId),
    queryFn: ({ pageParam }) =>
      privateApiCall(() =>
        api.listGiftIdeas({ spaceId, cursor: pageParam, limit: PAGE_SIZE }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const ideas = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        before={<PrivateAreaBackToHub />}
        title={t('privateArea.gifts.title')}
        description={t('privateArea.gifts.intro')}
        action={
          <Link className="button-link" to={`${PRIVATE_GIFT_IDEAS_PATH}/new`}>
            {t('privateArea.gifts.add')}
          </Link>
        }
      />
      {query.isLoading ? (
        <UiState kind="loading" title={t('privateArea.gifts.loading')} />
      ) : null}
      {query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && ideas.length === 0 ? (
        <UiState
          kind="empty"
          title={t('privateArea.gifts.emptyTitle')}
          body={t('privateArea.gifts.emptyBody')}
        />
      ) : null}
      {ideas.length > 0 ? (
        <section className="private-area-results" aria-live="polite">
          <ul className="private-area-list layout-columns layout-columns-dense">
            {ideas.map((gift) => (
              <li key={gift.id}>
                <Link
                  className="private-area-card private-area-card-clickable"
                  to={privateGiftIdeaPath(gift.id)}
                >
                  <div className="private-area-card-main">
                    <div className="private-area-card-heading">
                      <h2>{gift.title}</h2>
                      <span className="private-area-badge">
                        {t(`privateArea.gifts.status.${gift.status}`)}
                      </span>
                    </div>
                    {gift.recipient ? (
                      <p className="private-area-recipient">{gift.recipient}</p>
                    ) : null}
                    {gift.description ? (
                      <p className="private-area-excerpt">{gift.description}</p>
                    ) : null}
                  </div>
                  <span className="private-area-card-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <LoadMoreButton
            hasMore={Boolean(query.hasNextPage)}
            loading={query.isFetchingNextPage}
            onLoadMore={() => void query.fetchNextPage()}
          />
        </section>
      ) : null}
    </>
  );
}

export function GiftIdeaCreatePage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const mutation = useMutation({
    mutationFn: (values: ReturnType<typeof giftValues>) =>
      privateApiCall(() =>
        api.createGiftIdea({ spaceId, giftIdeaCreate: values }),
      ),
    onSuccess: async (gift) => {
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.giftIdeas(accountId, spaceId),
      });
      closeTask(() => {
        navigate(privateGiftIdeaPath(gift.id), {
          replace: true,
          state: navigationState,
        });
      });
    },
  });
  const titleValidation = useRequiredTitleValidation(
    mutation.error,
    'GIFT_IDEA_TITLE_REQUIRED',
    mutation.reset,
  );
  const {
    navigationState,
    showDiscardConfirm,
    keepEditing,
    closeConfirmed: closeTask,
    requestClose,
  } = usePrivateTaskEditorLifecycle({
    fallbackPath: PRIVATE_GIFT_IDEAS_PATH,
    isDirty: dirty,
    isCloseBlocked: mutation.isPending,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const values = giftValues(new FormData(event.currentTarget));
    const title = titleValidation.validate(values.title);
    if (title === null) return;
    mutation.mutate({ ...values, title });
  }

  return (
    <>
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={mutation.isPending}
          >
            {t('privateArea.gifts.detailBack')}
          </button>
        }
        title={t('privateArea.gifts.createTitle')}
        description={t('privateArea.gifts.intro')}
      />
      <section className="form-card private-area-editor">
        <form
          className="form-grid"
          onSubmit={submit}
          onChange={() => setDirty(true)}
        >
          <GiftIdeaFields titleValidation={titleValidation} />
          <div className="form-actions">
            <button
              type="button"
              className="button-link secondary-link"
              onClick={requestClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? t('privateArea.saving')
                : t('privateArea.save')}
            </button>
          </div>
        </form>
        {mutation.error && !titleValidation.serverInvalid ? (
          <ProblemState error={mutation.error} />
        ) : null}
      </section>
      <PrivateEditorDiscardSheet
        open={showDiscardConfirm}
        onKeep={keepEditing}
        onDiscard={() => closeTask()}
      />
    </>
  );
}

export function GiftIdeaDetailPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const { query } = useGiftIdea(api, accountId, spaceId);
  const { navigationState } = usePrivateAreaTaskContext(
    PRIVATE_GIFT_IDEAS_PATH,
  );

  if (query.isLoading)
    return <UiState kind="loading" title={t('privateArea.gifts.loading')} />;
  if (query.error)
    return (
      <ProblemState error={query.error} onRetry={() => void query.refetch()} />
    );
  const gift = query.data;
  if (!gift) return null;
  const targetOn = formatDate(gift.targetOn);

  return (
    <>
      <PageHeader
        before={
          <PrivateAreaDetailBack
            fallbackPath={PRIVATE_GIFT_IDEAS_PATH}
            fallbackLabel={t('privateArea.gifts.detailBack')}
          />
        }
        eyebrow={t('privateArea.privacyLabel')}
        title={gift.title}
        description={t(`privateArea.gifts.status.${gift.status}`)}
        action={
          gift.capabilities.canEdit ? (
            <Link
              className="button-link secondary-link"
              to={privateGiftIdeaEditPath(gift.id)}
              state={navigationState}
            >
              {t('privateArea.edit')}
            </Link>
          ) : undefined
        }
      />
      <article className="private-area-detail-card">
        <dl className="private-area-meta-grid">
          {gift.recipient ? (
            <div>
              <dt>{t('privateArea.gifts.recipientLabel')}</dt>
              <dd>{gift.recipient}</dd>
            </div>
          ) : null}
          {gift.occasion ? (
            <div>
              <dt>{t('privateArea.gifts.occasionLabel')}</dt>
              <dd>{gift.occasion}</dd>
            </div>
          ) : null}
          {targetOn ? (
            <div>
              <dt>{t('privateArea.gifts.targetOnLabel')}</dt>
              <dd>{targetOn}</dd>
            </div>
          ) : null}
          {gift.priceText ? (
            <div>
              <dt>{t('privateArea.gifts.priceLabel')}</dt>
              <dd>{gift.priceText}</dd>
            </div>
          ) : null}
          {gift.url ? (
            <div>
              <dt>{t('privateArea.gifts.urlLabel')}</dt>
              <dd className="private-area-url">{gift.url}</dd>
            </div>
          ) : null}
        </dl>
        <p className="private-area-detail-body">
          {gift.description || t('privateArea.gifts.noDetails')}
        </p>
      </article>
    </>
  );
}

export function GiftIdeaEditPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const { giftIdeaId, query } = useGiftIdea(api, accountId, spaceId);
  const deleteMutation = useMutation({
    mutationFn: (targetGift: GiftIdeaDetail) =>
      privateApiCall(() =>
        api.deleteGiftIdea({
          spaceId,
          giftIdeaId: targetGift.id,
          ifMatch: String(targetGift.version),
        }),
      ),
    onSuccess: async () => {
      if (giftIdeaId) {
        queryClient.removeQueries({
          queryKey: privateAreaQueryKeys.giftIdea(
            accountId,
            spaceId,
            giftIdeaId,
          ),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.giftIdeas(accountId, spaceId),
      });
      closeTask(() => navigate(PRIVATE_GIFT_IDEAS_PATH, { replace: true }));
    },
  });

  const mutation = useMutation({
    mutationFn: ({ gift, data }: { gift: GiftIdeaDetail; data: FormData }) => {
      const values = giftValues(data);
      return privateApiCall(() =>
        api.updateGiftIdea({
          spaceId,
          giftIdeaId: gift.id,
          ifMatch: String(gift.version),
          giftIdeaUpdate: {
            ...values,
            status: String(
              data.get('status') || gift.status,
            ) as GiftIdeaDetail['status'],
          },
        }),
      );
    },
    onSuccess: async (gift) => {
      queryClient.setQueryData(
        privateAreaQueryKeys.giftIdea(accountId, spaceId, gift.id),
        gift,
      );
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.giftIdeas(accountId, spaceId),
      });
      closeTask(() => {
        navigate(privateGiftIdeaPath(gift.id), {
          replace: true,
          state: navigationState,
        });
      });
    },
  });
  const titleValidation = useRequiredTitleValidation(
    mutation.error,
    'GIFT_IDEA_TITLE_REQUIRED',
    mutation.reset,
  );
  const detailFallback = giftIdeaId
    ? privateGiftIdeaPath(giftIdeaId)
    : PRIVATE_GIFT_IDEAS_PATH;
  const {
    navigationState,
    showDiscardConfirm,
    keepEditing,
    closeConfirmed: closeTask,
    requestClose,
  } = usePrivateTaskEditorLifecycle({
    fallbackPath: detailFallback,
    isDirty: dirty,
    isCloseBlocked: mutation.isPending || deleteMutation.isPending,
    closeToFallback: true,
  });

  if (query.isLoading)
    return <UiState kind="loading" title={t('privateArea.gifts.loading')} />;
  if (query.error)
    return (
      <ProblemState error={query.error} onRetry={() => void query.refetch()} />
    );
  const gift = query.data;
  if (!gift) return null;
  if (!gift.capabilities.canEdit) {
    return (
      <UiState
        kind="permission"
        title={t('states.permission.title')}
        body={t('states.permission.body')}
      />
    );
  }
  const editableGift: GiftIdeaDetail = gift;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const title = titleValidation.validate(String(data.get('title') || ''));
    if (title === null) return;
    data.set('title', title);
    mutation.mutate({
      gift: editableGift,
      data,
    });
  }

  return (
    <>
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={mutation.isPending || deleteMutation.isPending}
          >
            {t('privateArea.gifts.detailBack')}
          </button>
        }
        title={t('privateArea.gifts.editTitle')}
        description={t('privateArea.gifts.intro')}
      />
      <section className="form-card private-area-editor">
        <form
          className="form-grid"
          onSubmit={submit}
          onChange={() => setDirty(true)}
        >
          <GiftIdeaFields
            giftIdea={gift}
            includeStatus
            titleValidation={titleValidation}
          />
          <div className="form-actions">
            <button
              type="button"
              className="button-link secondary-link"
              onClick={requestClose}
              disabled={mutation.isPending || deleteMutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? t('privateArea.saving')
                : t('privateArea.save')}
            </button>
          </div>
        </form>
        {mutation.error && !titleValidation.serverInvalid ? (
          <ProblemState error={mutation.error} />
        ) : null}
      </section>

      {gift.capabilities.canDelete ? (
        <article
          className="private-area-detail-card"
          style={{ marginTop: 'var(--space-8)' }}
        >
          <DeleteConfirmation
            onDelete={() => deleteMutation.mutate(gift)}
            pending={deleteMutation.isPending}
            error={deleteMutation.error}
          />
        </article>
      ) : null}
      <PrivateEditorDiscardSheet
        open={showDiscardConfirm}
        onKeep={keepEditing}
        onDiscard={() => closeTask()}
      />
    </>
  );
}
