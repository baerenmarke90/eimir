import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeClientError } from '../client/problemDetails';
import { WISH_CREATE_ROUTE, wishDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import {
  clearSharedWishDraft,
  type SharedWishNavigationState,
  stageSharedWishDraft,
} from '../client/sharedWishDraft';
import {
  extractSharedWishContent,
  nativeWishShare,
  readSharedWishImage,
  type SharedWish,
} from '../client/sharedWishImport';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import { UiState } from './UiState';
import './WishShareIngress.css';

type Step = 'choice' | 'pick';
type Target = { mode: 'create' } | { mode: 'add'; wishId: string };

function linkHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Receives text and a photo shared into the app (for example from WhatsApp)
 * and offers to start a Wish from it. Nothing is saved here: the Wish editor
 * receives a volatile draft and only its own Save writes to the server.
 */
export function WishShareIngress({
  scope,
  apis,
  spaceId,
}: {
  scope: string;
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState<SharedWish | null>(null);
  const [step, setStep] = useState<Step>('choice');
  const [busy, setBusy] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [dismissedAt, setDismissedAt] = useState('');
  const operation = useRef<AbortController | null>(null);
  const ownedGeneration = useRef<string | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let listener: PluginListenerHandle | undefined;
    const inspect = async () => {
      const state = await nativeWishShare.peek().catch(() => null);
      if (
        active &&
        state &&
        (state.available || state.failed) &&
        (state.text || state.hasImage || state.failed)
      ) {
        ownedGeneration.current = state.generation;
        setPending(state);
        setStep('choice');
        setPhotoFailed(state.failed);
        setImportFailed(false);
        setDismissedAt('');
      }
    };
    void nativeWishShare
      .addListener('wishShared', () => void inspect())
      .then((handle) => {
        if (active) listener = handle;
        else void handle.remove();
      })
      .catch(() => {});
    void inspect();
    return () => {
      active = false;
      operation.current?.abort();
      void listener?.remove();
      clearSharedWishDraft(scope);
      if (ownedGeneration.current)
        void nativeWishShare
          .discard({ generation: ownedGeneration.current })
          .catch(() => {});
    };
  }, [scope]);

  const content = useMemo(
    () => extractSharedWishContent(pending?.text),
    [pending?.text],
  );
  const editing = /\/(new|edit)$/.test(location.pathname);
  const wishes = useInfiniteQuery({
    queryKey: ['m5-s3', 'wishes', spaceId, 'share-target'],
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(pending) && step === 'pick' && !editing,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await apis.wishes.listWishes(
          { spaceId, status: 'OPEN', cursor: pageParam, limit: 30 },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    getNextPageParam: (page, _pages, lastCursor, cursors) => {
      const next = page.nextCursor;
      return next && next !== lastCursor && !cursors.includes(next)
        ? next
        : undefined;
    },
  });
  useEffect(() => {
    if (
      step === 'pick' &&
      wishes.hasNextPage &&
      !wishes.isFetching &&
      !wishes.error
    )
      void wishes.fetchNextPage();
  }, [
    step,
    wishes.hasNextPage,
    wishes.isFetching,
    wishes.error,
    wishes.fetchNextPage,
  ]);
  // The wish the user just touched is the likeliest target of a second share.
  const openWishes = useMemo(
    () =>
      [...(wishes.data?.pages.flatMap((page) => page.items) ?? [])].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      ),
    [wishes.data],
  );

  if (!pending) return null;
  const hasText = Boolean(
    content.title || content.description || content.linkUrl,
  );
  const photoWanted = pending.hasImage && !pending.failed;
  const usable = hasText || (photoWanted && !photoFailed);
  const host = linkHost(content.linkUrl);
  const snippet = content.title ?? content.description;
  const loadingWishes =
    wishes.isPending || Boolean(wishes.hasNextPage && !wishes.error);

  async function commit(target: Target) {
    if (!pending || editing || busy) return;
    const owner = scope;
    const generation = pending.generation;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setImportFailed(false);
    try {
      let photo: File | undefined;
      if (photoWanted && !photoFailed) {
        try {
          photo = await readSharedWishImage(generation, controller.signal);
        } catch {
          if (controller.signal.aborted) return;
          // The text stays usable: the next press continues without the photo.
          setPhotoFailed(true);
          return;
        }
      }
      if (controller.signal.aborted || currentScope.current !== owner) return;
      const key = stageSharedWishDraft(owner, {
        ...(content.title ? { title: content.title } : {}),
        ...(content.description ? { description: content.description } : {}),
        ...(content.linkUrl ? { linkUrl: content.linkUrl } : {}),
        ...(photo ? { photo } : {}),
      });
      await nativeWishShare.discard({ generation }).catch(() => {});
      if (controller.signal.aborted || currentScope.current !== owner) {
        clearSharedWishDraft(owner);
        return;
      }
      setPending(null);
      const state: SharedWishNavigationState = {
        wishShareKey: key,
        wishShareMode: target.mode,
      };
      navigate(
        target.mode === 'add'
          ? wishDetailPath(target.wishId)
          : WISH_CREATE_ROUTE,
        { state },
      );
    } catch {
      if (!controller.signal.aborted) setImportFailed(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function dismiss() {
    if (!pending || busy) return;
    void nativeWishShare
      .discard({ generation: pending.generation })
      .catch(() => {});
    setPending(null);
  }

  return (
    <ShortTaskSheet
      open={dismissedAt !== location.key}
      title={t(step === 'pick' ? 'wishShare.pickTitle' : 'wishShare.title')}
      className="wish-share-sheet"
      isCloseBlocked={busy}
      onClose={() => {
        if (busy) return;
        if (step === 'pick') setStep('choice');
        else if (editing) setDismissedAt(location.key);
        else dismiss();
      }}
    >
      {editing ? (
        <p role="status">{t('wishShare.finishEditingFirst')}</p>
      ) : step === 'pick' ? (
        <>
          <p>{t('wishShare.pickIntro')}</p>
          {wishes.error ? (
            <ProblemState
              error={wishes.error}
              onRetry={() => void wishes.refetch()}
            />
          ) : loadingWishes ? (
            <UiState
              kind="loading"
              compact
              title={t('wishShare.pickLoading')}
            />
          ) : openWishes.length === 0 ? (
            <UiState
              kind="empty"
              compact
              title={t('wishShare.pickEmptyTitle')}
              body={t('wishShare.pickEmptyBody')}
            />
          ) : (
            <ul className="wish-share-choices">
              {openWishes.map((wish) => (
                <li key={wish.id}>
                  <button
                    type="button"
                    className="wish-share-choice"
                    disabled={busy || !usable}
                    onClick={() =>
                      void commit({ mode: 'add', wishId: wish.id })
                    }
                  >
                    <strong>{wish.title}</strong>
                    <small>
                      {t('wishShare.pickUpdated', {
                        date: new Intl.DateTimeFormat(resolvedLocale(), {
                          dateStyle: 'medium',
                        }).format(wish.updatedAt),
                      })}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photoFailed && photoWanted ? (
            <p role="alert">{t('wishShare.photoFailed')}</p>
          ) : null}
          {importFailed ? (
            <p role="alert">{t('wishShare.importFailed')}</p>
          ) : null}
          <button
            type="button"
            className="tertiary"
            disabled={busy}
            onClick={() => setStep('choice')}
          >
            {t('wishShare.pickBack')}
          </button>
        </>
      ) : (
        <>
          <p>{t('wishShare.intro')}</p>
          <ul className="wish-share-preview">
            {host ? (
              <li className="wish-share-chip">
                {t('wishShare.linkFrom', { host })}
              </li>
            ) : null}
            {pending.hasImage && !pending.failed ? (
              <li className="wish-share-chip">
                {t('wishShare.photo', {
                  count: Math.max(1, pending.imageCount),
                })}
              </li>
            ) : null}
            {snippet ? <li className="wish-share-snippet">{snippet}</li> : null}
          </ul>
          {photoFailed && (photoWanted || pending.failed) ? (
            <p role="alert">
              {t(hasText ? 'wishShare.photoFailed' : 'wishShare.nothingUsable')}
            </p>
          ) : null}
          {importFailed ? (
            <p role="alert">{t('wishShare.importFailed')}</p>
          ) : null}
          <div className="wish-share-actions">
            <AddActionButton
              label={t('wishShare.saveAsWish')}
              disabled={busy || !usable}
              onClick={() => void commit({ mode: 'create' })}
            />
            <button
              type="button"
              className="secondary"
              disabled={busy || !usable}
              onClick={() => setStep('pick')}
            >
              {t('wishShare.addToWish')}
            </button>
            <button
              type="button"
              className="tertiary"
              disabled={busy}
              onClick={dismiss}
            >
              {t('wishShare.dismiss')}
            </button>
          </div>
        </>
      )}
    </ShortTaskSheet>
  );
}
