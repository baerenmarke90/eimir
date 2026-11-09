import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { PhotoSourcesApi } from '../api/generated/apis/PhotoSourcesApi';
import type { PhotoSelectionView } from '../api/generated/models/PhotoSelectionView';
import {
  createOwnedObjectUrl,
  type OwnedObjectUrl,
} from '../client/objectUrlResource';
import {
  closePhotoBrowser,
  openPhotoBrowser,
  photoFile,
  preparePhotoBrowser,
  readPhotoThumbnail,
  selectionReady,
  waitForPhotoPoll,
} from '../client/photoSources';
import { usePhotoSources } from '../client/usePhotoSources';
import type { AttachmentDraftSelection } from '../client/useAttachmentDrafts';
import { useTranslation } from '../i18n';
import { ProMark } from './ProMark';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import { AutoLoadTrigger } from './AutoLoadMore';
import './PhotoSourcePicker.css';
import { AddActionContent } from './AddAction';

interface SelectionTask {
  api: PhotoSourcesApi;
  ticket: AttachmentDraftSelection;
  request: AbortController;
  id?: string;
  popup: Window | null;
}

export function SourceThumbnail({
  api,
  spaceId,
  selectionId,
  itemId,
  signal,
}: {
  api: PhotoSourcesApi;
  spaceId: string;
  selectionId: string;
  itemId: string;
  signal: AbortSignal;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const target = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: '120px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a deliberate retry owns a fresh request even when the selected identity is unchanged
  useEffect(() => {
    if (!visible || signal.aborted) {
      setUrl(null);
      return;
    }
    const request = new AbortController();
    const abort = () => request.abort();
    signal.addEventListener('abort', abort, { once: true });
    let owned: OwnedObjectUrl | undefined;
    setUrl(null);
    setFailed(false);
    void readPhotoThumbnail(api, spaceId, selectionId, itemId, request.signal)
      .then((blob) => {
        if (request.signal.aborted || signal.aborted) return;
        owned = createOwnedObjectUrl(blob);
        setUrl(owned.url);
      })
      .catch(() => {
        if (!request.signal.aborted && !signal.aborted) setFailed(true);
      });
    return () => {
      request.abort();
      signal.removeEventListener('abort', abort);
      owned?.dispose();
    };
  }, [api, spaceId, selectionId, itemId, signal, visible, attempt]);
  return (
    <span ref={target} className="photo-source-thumbnail">
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} />
      ) : failed ? (
        <span className="photo-source-thumbnail-error">
          <span>{t('photoSources.previewFailed')}</span>
          <button
            type="button"
            className="tertiary"
            disabled={signal.aborted}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t('common.retry')}
          </button>
        </span>
      ) : (
        <span className="photo-source-placeholder" aria-hidden="true">
          <EimirIcon name="foto" />
        </span>
      )}
    </span>
  );
}

/** Short source task; all accepted Files use the existing attachment controller. */
export function PhotoSourcePicker({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  remaining,
  beginSelection,
  disabled = false,
  devicePicker,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  remaining: number;
  beginSelection: () => AttachmentDraftSelection;
  disabled?: boolean;
  devicePicker?: (close: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const { apiRef, availability } = usePhotoSources({
    apiBaseUrl,
    accessToken,
    accountId,
    spaceId,
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<PhotoSelectionView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const task = useRef<SelectionTask | null>(null);
  const lifetime = useRef(new AbortController());

  function release() {
    const current = task.current;
    task.current = null;
    current?.request.abort();
    current?.ticket.cancel();
    if (current) {
      void closePhotoBrowser(current.popup);
      if (current.id)
        void current.api
          .cancelPhotoSelection({ spaceId, selectionId: current.id })
          .catch(() => {});
    }
  }

  // Session-token refresh does not cancel a committed picker. Scope changes do.
  // biome-ignore lint/correctness/useExhaustiveDependencies: token transport is committed through apiRef
  useEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    setOpen(false);
    setView(null);
    setSelected([]);
    setMessage('');
    setBusy(false);
    return () => {
      owner.abort();
      release();
    };
  }, [apiBaseUrl, accountId, spaceId]);

  function close() {
    release();
    setOpen(false);
    setBusy(false);
    setView(null);
    setSelected([]);
  }

  async function importItems(
    current: SelectionTask,
    ready: PhotoSelectionView,
    ids: string[],
  ) {
    const owner = lifetime.current;
    if (!navigator.onLine) {
      setMessage(t('photoSources.offline'));
      return;
    }
    const files: File[] = [];
    const failedIds = ids.slice(remaining);
    setBusy(true);
    setMessage(t('photoSources.progress'));
    try {
      for (const id of ids.slice(0, remaining)) {
        current.ticket.signal.throwIfAborted();
        try {
          const blob = await current.api.readSelectedPhoto(
            { spaceId, selectionId: ready.id, itemId: id },
            { signal: current.request.signal, cache: 'no-store' },
          );
          current.ticket.signal.throwIfAborted();
          files.push(photoFile(blob, files.length, ready.source === 'google'));
        } catch (error) {
          if (current.request.signal.aborted || current.ticket.signal.aborted)
            throw error;
          failedIds.push(id);
        }
      }
      if (task.current !== current || current.ticket.signal.aborted) return;
      if (!files.length) {
        setMessage(t('photoSources.importFailed'));
        return;
      }
      if (!current.ticket.commit(files)) return;
      if (failedIds.length) {
        current.ticket = beginSelection();
        current.ticket.signal.addEventListener(
          'abort',
          () => current.request.abort(),
          { once: true },
        );
        setSelected(failedIds);
        setMessage(t('photoSources.partial', { count: files.length }));
      } else close();
    } catch {
      if (!current.request.signal.aborted)
        setMessage(t('photoSources.importFailed'));
    } finally {
      if (!owner.signal.aborted && (!task.current || task.current === current))
        setBusy(false);
    }
  }

  async function start(source: 'google' | 'immich') {
    const owner = lifetime.current;
    if (disabled || busy || task.current || remaining <= 0) return;
    if (!navigator.onLine) {
      setMessage(t('photoSources.offline'));
      return;
    }
    release();
    const current: SelectionTask = {
      api: apiRef.current,
      ticket: beginSelection(),
      request: new AbortController(),
      popup: source === 'google' ? preparePhotoBrowser() : null,
    };
    task.current = current;
    current.ticket.signal.addEventListener(
      'abort',
      () => current.request.abort(),
      { once: true },
    );
    setBusy(true);
    setMessage('');
    try {
      let ready = await current.api.startPhotoSelection(
        {
          spaceId,
          photoSelectionCreate: {
            source,
            maxItems: Math.min(20, remaining),
            consent: true,
            mediaRecoveryPolicy:
              source === 'google' ? 'memory-only-v1' : undefined,
          },
        },
        { signal: current.request.signal },
      );
      current.id = ready.id;
      if (current.ticket.signal.aborted || task.current !== current) {
        void current.api
          .cancelPhotoSelection({ spaceId, selectionId: ready.id })
          .catch(() => {});
        return;
      }
      if (source === 'immich') {
        setView(ready);
        setBusy(false);
        return;
      }
      if (!ready.authorizationUrl)
        throw new Error('Photo authorization is unavailable.');
      await openPhotoBrowser(ready.authorizationUrl, current.popup);
      setMessage(t('photoSources.waiting'));
      while (!selectionReady(ready)) {
        await waitForPhotoPoll(
          ready.pollAfterSeconds ?? 5,
          current.request.signal,
        );
        ready = await current.api.pollPhotoSelection(
          { spaceId, selectionId: ready.id },
          { signal: current.request.signal },
        );
        if (task.current !== current) return;
      }
      await closePhotoBrowser(current.popup);
      if (ready.items.length)
        await importItems(
          current,
          ready,
          ready.items.map((item) => item.id),
        );
      else close();
    } catch {
      if (!current.request.signal.aborted) {
        release();
        setMessage(t('photoSources.unavailable'));
      }
    } finally {
      if (!owner.signal.aborted && (!task.current || task.current === current))
        setBusy(false);
    }
  }

  async function more() {
    const owner = lifetime.current;
    const current = task.current;
    if (!current?.id || busy) return false;
    setBusy(true);
    setMessage('');
    try {
      const next = await current.api.pollPhotoSelection(
        { spaceId, selectionId: current.id, more: true },
        { signal: current.request.signal },
      );
      if (task.current !== current || current.request.signal.aborted)
        return false;
      setView(next);
      return !next.hasMore || next.items.length > (view?.items.length ?? 0);
    } catch {
      if (!current.request.signal.aborted)
        setMessage(t('photoSources.unavailable'));
      return false;
    } finally {
      if (!owner.signal.aborted && (!task.current || task.current === current))
        setBusy(false);
    }
  }

  if (
    !devicePicker &&
    (!availability || (!availability.enabled && !availability.immichConnected))
  )
    return null;
  const canImport = Boolean(availability?.enabled && availability.canImport);
  const activeTask = task.current;
  return (
    <>
      <div className="photo-source-actions">
        {devicePicker?.(() => {})}
        {availability &&
        (availability.enabled || availability.immichConnected) ? (
          <button
            ref={trigger}
            type="button"
            className="add-action photo-source-trigger"
            disabled={disabled || remaining <= 0}
            onClick={() => {
              setMessage('');
              setOpen(true);
            }}
          >
            <AddActionContent label={t('photoSources.more')} />{' '}
            <ProMark label={t('photoSources.pro')} />
          </button>
        ) : null}
      </div>
      <ShortTaskSheet
        open={open}
        title={t('photoSources.title')}
        closeLabel={t('taskSheets.close')}
        onClose={close}
        restoreFocusRef={trigger}
        className="photo-source-sheet"
        footer={
          <div className="photo-source-footer">
            <button type="button" className="secondary" onClick={close}>
              {t('taskSheets.close')}
            </button>
            {view ? (
              <button
                type="button"
                disabled={!selected.length || busy || remaining <= 0}
                onClick={() => {
                  if (task.current)
                    void importItems(task.current, view, selected);
                }}
              >
                {t('photoSources.import')}
              </button>
            ) : null}
          </div>
        }
      >
        {message ? <p role={busy ? 'status' : 'alert'}>{message}</p> : null}
        {view && activeTask ? (
          <>
            <p role="status">
              {t('photoSources.selected', { count: selected.length })}
            </p>
            {!view.items.length ? <p>{t('photoSources.empty')}</p> : null}
            <div className="photo-source-grid">
              {view.items.map((item, index) => (
                <div className="photo-source-choice" key={item.id}>
                  <label className="photo-source-select">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      disabled={
                        busy ||
                        (!selected.includes(item.id) &&
                          selected.length >= remaining)
                      }
                      onChange={(event) =>
                        setSelected((items) =>
                          event.target.checked
                            ? [...items, item.id]
                            : items.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span className="sr-only">
                      {t('photoSources.photo', { number: index + 1 })}
                    </span>
                  </label>
                  <SourceThumbnail
                    api={activeTask.api}
                    spaceId={spaceId}
                    selectionId={view.id}
                    itemId={item.id}
                    signal={activeTask.request.signal}
                  />
                </div>
              ))}
            </div>
            {view.hasMore ? (
              <AutoLoadTrigger
                className="secondary"
                cursor={view.items.at(-1)?.id ?? view.id}
                scopeKey={view.id}
                loading={busy}
                blocked={busy || navigator.onLine === false}
                failed={Boolean(message)}
                onLoad={more}
              >
                {t('photoSources.loadMore')}
              </AutoLoadTrigger>
            ) : null}
          </>
        ) : (
          <>
            {canImport && availability?.googleAvailable ? (
              <button
                type="button"
                className="secondary photo-source-trigger"
                disabled={busy || disabled}
                onClick={() => void start('google')}
              >
                <EimirIcon name="foto" /> {t('photoSources.google')}
              </button>
            ) : null}
            {canImport && availability?.googleAvailable ? (
              <p>{t('photoSources.googleConsent')}</p>
            ) : null}
            {availability?.enabled || availability?.immichConnected ? (
              <button
                type="button"
                className="secondary photo-source-trigger"
                disabled={
                  busy ||
                  disabled ||
                  !canImport ||
                  !availability.immichConnected
                }
                title={
                  availability.immichConnected
                    ? undefined
                    : t('photoSources.configureInSettings')
                }
                onClick={() => void start('immich')}
              >
                <EimirIcon name="foto" /> {t('photoSources.immich')}
              </button>
            ) : null}
          </>
        )}
      </ShortTaskSheet>
    </>
  );
}
