import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { PhotoSourcesApi } from '../api/generated/apis/PhotoSourcesApi';
import type { PhotoSelectionItemView } from '../api/generated/models/PhotoSelectionItemView';
import type { PhotoSelectionView } from '../api/generated/models/PhotoSelectionView';
import {
  createOwnedObjectUrl,
  type OwnedObjectUrl,
} from '../client/objectUrlResource';
import {
  closePhotoBrowser,
  type ItemOutcome,
  importFailure,
  initialOutcomes,
  itemAvailability,
  itemKind,
  openPhotoBrowser,
  photoFile,
  preparePhotoBrowser,
  readPhotoThumbnail,
  selectionIsTyped,
  selectionReady,
  videoVerdictReason,
  waitForPhotoPoll,
  watchGoogleAppReturn,
  watchPhotoBrowserReturn,
} from '../client/photoSources';
import { normalizeClientError } from '../client/problemDetails';
import {
  ReferenceFlowError,
  waitUntilAttachmentReady,
} from '../client/referenceFlow';
import type {
  AttachmentDraftSelection,
  StagedVideo,
} from '../client/useAttachmentDrafts';
import { usePhotoSources } from '../client/usePhotoSources';
import { useTranslation } from '../i18n';
import { isCapacitorNative } from '../pwa';
import { AutoLoadTrigger } from './AutoLoadMore';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import type { VideoCaptureContext } from './VideoUploadAction';
import './PhotoSourcePicker.css';
import { MediaIntakeButton } from './MediaIntakeButton';

// How long one imported video may take to be checked before it is added as "still preparing".
const VIDEO_CHECK_MILLISECONDS = 90_000;
// Google answers still awaited after the person closed its browser in the app.
const RETURN_POLLS = 2;

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
  unified = false,
  videoContext,
  renderTrigger,
  onExternalAvailability,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  remaining: number;
  beginSelection: () => AttachmentDraftSelection;
  disabled?: boolean;
  devicePicker?: (
    close: () => void,
    actionContainer?: HTMLElement | null,
    blocked?: boolean,
  ) => ReactNode;
  unified?: boolean;
  /** Present only where the destination accepts videos; Plans and avatars stay image-only. */
  videoContext?: VideoCaptureContext;
  renderTrigger?: (open: () => void, openExternal: () => void) => ReactNode;
  /** Reports whether an external source (Immich, Google Photos) is offered. */
  onExternalAvailability?: (available: boolean) => void;
}) {
  const { t } = useTranslation();
  const { apiRef, availability, loading } = usePhotoSources({
    apiBaseUrl,
    accessToken,
    accountId,
    spaceId,
  });
  const externalAvailable = Boolean(
    availability?.enabled || availability?.immichConnected,
  );
  useEffect(() => {
    onExternalAvailability?.(externalAvailable);
  }, [externalAvailable, onExternalAvailability]);
  const [open, setOpen] = useState(false);
  const [externalOnly, setExternalOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<PhotoSelectionView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // Google only: true while the person chooses in Google, and the photos still to retry.
  const [awaitingGoogle, setAwaitingGoogle] = useState(false);
  const [retry, setRetry] = useState<{
    ready: PhotoSelectionView;
    ids: string[];
  } | null>(null);
  // Typed Google selection: what Google returned and what became of each item.
  const [overview, setOverview] = useState<PhotoSelectionView | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, ItemOutcome>>({});
  const outcomesRef = useRef<Record<string, ItemOutcome>>({});
  const allowVideo = Boolean(videoContext);
  const [deviceTarget, setDeviceTarget] = useState<HTMLDivElement | null>(null);
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
    setAwaitingGoogle(false);
    setRetry(null);
    setOverview(null);
    setAllOutcomes({});
    setMessage('');
    setBusy(false);
    return () => {
      owner.abort();
      release();
    };
  }, [apiBaseUrl, accountId, spaceId]);

  function setAllOutcomes(next: Record<string, ItemOutcome>) {
    outcomesRef.current = next;
    setOutcomes(next);
  }

  function close() {
    release();
    setOpen(false);
    setBusy(false);
    setView(null);
    setSelected([]);
    setAwaitingGoogle(false);
    setRetry(null);
    setOverview(null);
    setAllOutcomes({});
  }

  function renewTicket(current: SelectionTask) {
    current.ticket = beginSelection();
    current.ticket.signal.addEventListener(
      'abort',
      () => current.request.abort(),
      { once: true },
    );
  }

  function runImport(
    current: SelectionTask,
    ready: PhotoSelectionView,
    ids: string[],
  ) {
    return selectionIsTyped(ready)
      ? importTyped(current, ready, ids)
      : importItems(current, ready, ids);
  }

  /** Move one provider-ready video through the server and wait for the server's verdict. */
  async function stageVideo(
    current: SelectionTask,
    ready: PhotoSelectionView,
    item: PhotoSelectionItemView,
  ): Promise<StagedVideo | ItemOutcome> {
    const attachment = await current.api.importSelectedVideo(
      { spaceId, selectionId: ready.id, itemId: item.id },
      { signal: current.request.signal },
    );
    let detail = attachment;
    if (detail.status !== 'READY' && videoContext) {
      // The same checks as a device video; a slow one is added as "still preparing".
      const limit = new AbortController();
      const stop = () => limit.abort();
      const timer = setTimeout(stop, VIDEO_CHECK_MILLISECONDS);
      current.request.signal.addEventListener('abort', stop, { once: true });
      try {
        detail = await waitUntilAttachmentReady(
          videoContext.apis,
          spaceId,
          attachment.id,
          limit.signal,
        );
      } catch (error) {
        if (current.request.signal.aborted) throw error;
        if (error instanceof ReferenceFlowError)
          return {
            state: 'unsupported',
            reason: videoVerdictReason(error.code),
          };
        // Timed out while still being checked: keep it, flagged as preparing.
      } finally {
        clearTimeout(timer);
        current.request.signal.removeEventListener('abort', stop);
      }
    }
    return {
      attachmentId: detail.id,
      name: 'video.mp4',
      mimeType: detail.mimeType ?? 'video/mp4',
      processing: detail.status !== 'READY',
      hasThumbnail: detail.hasThumbnail,
      durationSeconds: detail.durationSeconds,
    };
  }

  /** Photos and videos together, in the order Google returned them. */
  async function importTyped(
    current: SelectionTask,
    ready: PhotoSelectionView,
    ids: string[],
  ) {
    const owner = lifetime.current;
    if (!navigator.onLine) {
      setMessage(t('photoSources.offline'));
      return;
    }
    const queue = [...ready.items]
      .filter((item) => ids.includes(item.id))
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
    let capacity = remaining;
    const retryIds: string[] = [];
    const settle = (id: string, outcome: ItemOutcome) =>
      setAllOutcomes({ ...outcomesRef.current, [id]: outcome });
    setOverview(ready);
    setRetry(null);
    setBusy(true);
    setMessage('');
    for (const item of queue) settle(item.id, { state: 'waiting' });
    try {
      for (const item of queue) {
        current.ticket.signal.throwIfAborted();
        if (capacity <= 0) {
          settle(item.id, {
            state: 'unsupported',
            reason: 'photoSources.itemNoRoom',
          });
          continue;
        }
        settle(item.id, { state: 'working' });
        try {
          let committed: boolean;
          if (itemKind(item) === 'VIDEO') {
            const staged = await stageVideo(current, ready, item);
            if ('state' in staged) {
              settle(item.id, staged);
              continue;
            }
            committed = current.ticket.commit([], [staged]);
          } else {
            const read = () =>
              current.api.readSelectedPhoto(
                { spaceId, selectionId: ready.id, itemId: item.id },
                { signal: current.request.signal, cache: 'no-store' },
              );
            // One quiet second attempt, so a brief hiccup never reaches the person.
            const blob = await read().catch((error) => {
              if (current.request.signal.aborted) throw error;
              return read();
            });
            committed = current.ticket.commit([
              photoFile(blob, item.ordinal ?? 0, true),
            ]);
          }
          if (!committed) return;
          capacity -= 1;
          renewTicket(current);
          settle(item.id, { state: 'done' });
        } catch (error) {
          if (current.request.signal.aborted || current.ticket.signal.aborted)
            throw error;
          const problem = await normalizeClientError(error);
          // The selection itself is gone: nothing here can continue.
          if (problem.kind === 'notFound' || problem.kind === 'unauthorized')
            throw error;
          const outcome = importFailure(problem);
          if (outcome.state === 'failed') retryIds.push(item.id);
          settle(item.id, outcome);
        }
      }
      if (task.current !== current || current.ticket.signal.aborted) return;
      if (retryIds.length) setRetry({ ready, ids: retryIds });
      else if (
        ready.items.every(
          (item) => outcomesRef.current[item.id]?.state === 'done',
        )
      )
        close();
    } catch {
      if (!current.request.signal.aborted) {
        setMessage(t('photoSources.importFailed'));
        setRetry({
          ready,
          ids: queue.map((item) => item.id),
        });
      }
    } finally {
      if (!owner.signal.aborted && (!task.current || task.current === current))
        setBusy(false);
    }
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
    setRetry(null);
    setBusy(true);
    setMessage(t('photoSources.progress'));
    try {
      for (const id of ids.slice(0, remaining)) {
        current.ticket.signal.throwIfAborted();
        try {
          // One quiet second attempt, so a brief hiccup never reaches the person.
          const read = () =>
            current.api.readSelectedPhoto(
              { spaceId, selectionId: ready.id, itemId: id },
              { signal: current.request.signal, cache: 'no-store' },
            );
          const blob = await read().catch((error) => {
            // Only the Google task retries quietly; other sources keep their contract.
            if (ready.source !== 'google' || current.request.signal.aborted)
              throw error;
            return read();
          });
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
        if (ready.source === 'google') setRetry({ ready, ids: [...failedIds] });
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
        if (ready.source === 'google') setRetry({ ready, ids: failedIds });
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
            // The system browser cannot share the app's cookie: Google returns to the app's own link.
            returnTo:
              source === 'google' && isCapacitorNative() ? 'app' : undefined,
            allowVideo: source === 'google' ? allowVideo : undefined,
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
      if (isCapacitorNative()) {
        // Sign in at Google, come back through the app's link, then open the Photos picker.
        const signedIn = watchGoogleAppReturn(current.request.signal);
        await openPhotoBrowser(ready.authorizationUrl, null);
        setAwaitingGoogle(true);
        setMessage(t('photoSources.signingIn'));
        const result = await signedIn;
        if (task.current !== current || current.request.signal.aborted) return;
        if (typeof result === 'string') {
          release();
          setAwaitingGoogle(false);
          setMessage(t('photoSources.nothingChosen'));
          return;
        }
        // The sign-in tab closes itself on the app link; make sure before the next one opens.
        await closePhotoBrowser(null);
        ready = await current.api.authorizePhotoSelection(
          {
            spaceId,
            selectionId: ready.id,
            photoSelectionAuthorize: result,
          },
          { signal: current.request.signal },
        );
        selectionReady(ready);
        if (!ready.pickerUri) throw new Error('Photo picker is unavailable.');
        await openPhotoBrowser(ready.pickerUri, null);
      } else await openPhotoBrowser(ready.authorizationUrl, current.popup);
      const watching = new AbortController();
      current.request.signal.addEventListener('abort', () => watching.abort(), {
        once: true,
      });
      const returned = watchPhotoBrowserReturn(watching.signal);
      let pollsSinceReturn = 0;
      setAwaitingGoogle(true);
      setMessage(
        t(allowVideo ? 'photoSources.waitingMedia' : 'photoSources.waiting'),
      );
      while (!selectionReady(ready)) {
        // Back in the app without a choice: stop waiting after two more
        // answers from Google, so a just-confirmed choice still arrives.
        pollsSinceReturn = returned() ? pollsSinceReturn + 1 : 0;
        if (pollsSinceReturn > RETURN_POLLS) {
          release();
          setAwaitingGoogle(false);
          setMessage(t('photoSources.nothingChosen'));
          return;
        }
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
      watching.abort();
      await closePhotoBrowser(current.popup);
      setAwaitingGoogle(false);
      if (selectionIsTyped(ready)) {
        setAllOutcomes(initialOutcomes(ready));
        setOverview(ready);
        await importTyped(
          current,
          ready,
          ready.items
            .filter((item) => itemAvailability(item) !== 'UNAVAILABLE')
            .map((item) => item.id),
        );
      } else if (ready.items.length)
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
  const openChooser = (external = false) => {
    if (disabled || remaining <= 0) return;
    if (document.activeElement instanceof HTMLButtonElement)
      trigger.current = document.activeElement;
    setMessage('');
    setExternalOnly(external);
    setOpen(true);
  };
  return (
    <>
      <div className="photo-source-actions">
        {unified
          ? devicePicker?.(close, deviceTarget, busy || remaining <= 0)
          : devicePicker?.(() => {})}
        {renderTrigger ? (
          renderTrigger(
            () => openChooser(),
            () => openChooser(true),
          )
        ) : unified ||
          (availability &&
            (availability.enabled || availability.immichConnected)) ? (
          <MediaIntakeButton
            ref={trigger}
            label={t(unified ? 'photoSources.addMedia' : 'photoSources.more')}
            icon={unified ? 'foto' : 'photo-library'}
            variant={unified ? 'entry' : 'source'}
            proLabel={unified ? undefined : t('photoSources.pro')}
            className={
              unified ? 'photo-source-composer-trigger' : 'photo-source-trigger'
            }
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={disabled || remaining <= 0}
            onClick={() => openChooser()}
          />
        ) : null}
      </div>
      <ShortTaskSheet
        open={open}
        title={t('photoSources.title')}
        closeLabel={t('common.close')}
        onClose={close}
        restoreFocusRef={trigger}
        className="photo-source-sheet"
        footer={
          <div className="photo-source-footer">
            <button type="button" className="secondary" onClick={close}>
              {t('common.close')}
            </button>
            {retry && !view ? (
              <button
                type="button"
                disabled={busy || remaining <= 0}
                onClick={() => {
                  if (task.current)
                    void runImport(task.current, retry.ready, retry.ids);
                }}
              >
                {t('common.retry')}
              </button>
            ) : null}
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
        {overview ? (
          <ul
            className="photo-source-results"
            aria-label={t('photoSources.resultsLabel')}
          >
            {[...overview.items]
              .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
              .map((item) => {
                const kind = itemKind(item);
                const outcome = outcomes[item.id];
                const state = outcome?.state ?? 'waiting';
                return (
                  <li
                    key={item.id}
                    className="photo-source-result"
                    data-state={state}
                  >
                    <span
                      className="photo-source-result-icon"
                      aria-hidden="true"
                    >
                      <EimirIcon name={kind === 'VIDEO' ? 'video' : 'foto'} />
                    </span>
                    <span className="photo-source-result-name">
                      {t(
                        kind === 'VIDEO'
                          ? 'photoSources.video'
                          : kind === 'IMAGE'
                            ? 'photoSources.photo'
                            : 'photoSources.file',
                        { number: (item.ordinal ?? 0) + 1 },
                      )}
                    </span>
                    <span
                      className="photo-source-result-state"
                      role={state === 'failed' ? 'alert' : undefined}
                    >
                      {outcome && 'reason' in outcome
                        ? t(outcome.reason)
                        : t(
                            state === 'done'
                              ? 'photoSources.itemDone'
                              : state === 'working'
                                ? 'photoSources.itemWorking'
                                : 'photoSources.itemWaiting',
                          )}
                    </span>
                  </li>
                );
              })}
          </ul>
        ) : null}
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
        ) : awaitingGoogle || retry || overview ? null : (
          <>
            {unified && !externalOnly ? (
              <div className="photo-source-device-slot" ref={setDeviceTarget} />
            ) : null}
            {externalOnly &&
            !availability?.enabled &&
            !availability?.immichConnected ? (
              <p role="status">
                {t(
                  loading ? 'states.loading.title' : 'photoSources.unavailable',
                )}
              </p>
            ) : null}
            {canImport && availability?.googleAvailable ? (
              <MediaIntakeButton
                label={t('photoSources.google')}
                icon="photo-library"
                proLabel={t('photoSources.pro')}
                className="photo-source-trigger"
                disabled={busy || disabled}
                onClick={() => void start('google')}
              />
            ) : null}
            {availability?.enabled || availability?.immichConnected ? (
              <MediaIntakeButton
                label={t('photoSources.immich')}
                icon="photo-library"
                proLabel={t('photoSources.pro')}
                className="photo-source-trigger"
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
              />
            ) : null}
          </>
        )}
      </ShortTaskSheet>
    </>
  );
}
