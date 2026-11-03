import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PhotoSourcesApi } from '../api/generated/apis/PhotoSourcesApi';
import type { PhotoSelectionView } from '../api/generated/models/PhotoSelectionView';
import type { PhotoSourceAvailability } from '../api/generated/models/PhotoSourceAvailability';
import {
  createOwnedObjectUrl,
  type OwnedObjectUrl,
} from '../client/objectUrlResource';
import {
  closePhotoBrowser,
  openPhotoBrowser,
  photoFile,
  photoSourcesApi,
  preparePhotoBrowser,
  readPhotoThumbnail,
  selectionReady,
  waitForPhotoPoll,
} from '../client/photoSources';
import { normalizeClientError } from '../client/problemDetails';
import type { AttachmentDraftSelection } from '../client/useAttachmentDrafts';
import { useTranslation } from '../i18n';
import { ProMark } from './ProMark';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PhotoSourcePicker.css';

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
  const api = useMemo(
    () => photoSourcesApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const apiRef = useRef(api);
  useLayoutEffect(() => {
    apiRef.current = api;
  }, [api]);
  const [availability, setAvailability] =
    useState<PhotoSourceAvailability | null>(null);
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [origin, setOrigin] = useState('');
  const [key, setKey] = useState('');
  const [consent, setConsent] = useState(false);
  const [source, setSource] = useState<'google' | 'immich'>('google');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<PhotoSelectionView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const task = useRef<SelectionTask | null>(null);
  const lifetime = useRef(new AbortController());
  const formRequest = useRef<AbortController | null>(null);

  function release() {
    const current = task.current;
    task.current = null;
    current?.request.abort();
    formRequest.current?.abort();
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
    setAvailability(null);
    setOpen(false);
    setLinking(false);
    setOrigin('');
    setKey('');
    setConsent(false);
    setView(null);
    setSelected([]);
    setMessage('');
    setBusy(false);
    void apiRef.current
      .getPhotoSources({ spaceId }, { signal: owner.signal })
      .then((value) => {
        if (!owner.signal.aborted) setAvailability(value);
      })
      .catch(() => {});
    return () => {
      owner.abort();
      release();
    };
  }, [apiBaseUrl, accountId, spaceId]);

  function close() {
    release();
    setOpen(false);
    setLinking(false);
    setKey('');
    setConsent(false);
    setBusy(false);
    setView(null);
    setSelected([]);
  }

  async function refreshAvailability() {
    const owner = lifetime.current;
    const value = await apiRef.current.getPhotoSources(
      { spaceId },
      { signal: owner.signal },
    );
    if (lifetime.current === owner && !owner.signal.aborted)
      setAvailability(value);
  }

  async function connect() {
    if (!availability || !consent || busy) return;
    const owner = new AbortController();
    formRequest.current = owner;
    setBusy(true);
    setMessage('');
    try {
      await apiRef.current.connectImmichPhotoSource(
        {
          spaceId,
          ifMatch: JSON.stringify(availability.immichConnectionToken),
          photoSourceConnectionCreate: {
            origin: origin.trim(),
            apiKey: key,
            consent: true,
          },
        },
        { signal: owner.signal },
      );
      if (owner.signal.aborted) return;
      setKey('');
      await refreshAvailability();
      if (owner.signal.aborted) return;
      setLinking(false);
      setSource('immich');
      setConsent(false);
    } catch (error) {
      await showConnectionFailure(
        error,
        owner,
        'photoSources.addressUnavailable',
      );
    } finally {
      if (!owner.signal.aborted) setBusy(false);
    }
  }

  async function disconnect() {
    if (!availability) return;
    release();
    const owner = new AbortController();
    formRequest.current = owner;
    setBusy(true);
    setMessage('');
    try {
      setView(null);
      await apiRef.current.disconnectImmichPhotoSource(
        {
          spaceId,
          ifMatch: JSON.stringify(availability.immichConnectionToken),
        },
        { signal: owner.signal },
      );
      if (owner.signal.aborted) return;
      await refreshAvailability();
      if (!owner.signal.aborted) setMessage(t('photoSources.disconnected'));
    } catch (error) {
      await showConnectionFailure(error, owner, 'photoSources.unavailable');
    } finally {
      if (!owner.signal.aborted) setBusy(false);
    }
  }

  async function showConnectionFailure(
    error: unknown,
    owner: AbortController,
    fallback: string,
  ) {
    if (owner.signal.aborted) return;
    const problem = await normalizeClientError(error);
    if (owner.signal.aborted) return;
    if (problem.status === 409 || problem.status === 403) {
      await refreshAvailability().catch(() => {});
      if (owner.signal.aborted) return;
      setKey('');
      setLinking(false);
      setConsent(false);
      setMessage(
        t(
          problem.status === 409
            ? 'photoSources.connectionChanged'
            : 'photoSources.proRequired',
        ),
      );
    } else setMessage(t(fallback));
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
    setBusy(true);
    setMessage(t('photoSources.progress'));
    try {
      for (const id of ids.slice(0, remaining)) {
        current.ticket.signal.throwIfAborted();
        try {
          const blob = await current.api.readSelectedPhoto(
            { spaceId, selectionId: ready.id, itemId: id },
            { signal: current.request.signal },
          );
          current.ticket.signal.throwIfAborted();
          files.push(photoFile(blob, files.length, ready.source === 'google'));
        } catch (error) {
          if (current.request.signal.aborted || current.ticket.signal.aborted)
            throw error;
        }
      }
      if (task.current !== current || current.ticket.signal.aborted) return;
      if (files.length && !current.ticket.commit(files)) return;
      const partial = files.length !== ids.length;
      release();
      setView(null);
      setSelected([]);
      setConsent(false);
      if (partial)
        setMessage(
          files.length
            ? t('photoSources.partial', { count: files.length })
            : t('photoSources.unavailable'),
        );
      else close();
    } catch {
      if (!current.request.signal.aborted)
        setMessage(t('photoSources.unavailable'));
    } finally {
      if (!owner.signal.aborted && (!task.current || task.current === current))
        setBusy(false);
    }
  }

  async function start() {
    const owner = lifetime.current;
    if (disabled || busy || remaining <= 0) return;
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
    if (!current?.id || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const next = await current.api.pollPhotoSelection(
        { spaceId, selectionId: current.id, more: true },
        { signal: current.request.signal },
      );
      if (task.current === current) setView(next);
    } catch {
      if (!current.request.signal.aborted)
        setMessage(t('photoSources.unavailable'));
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
      <button
        ref={trigger}
        type="button"
        className="secondary photo-source-trigger"
        disabled={disabled || remaining <= 0}
        onClick={() => {
          setMessage('');
          setConsent(false);
          setSource(availability?.googleAvailable ? 'google' : 'immich');
          setOpen(true);
        }}
      >
        {devicePicker ? (
          <>
            <EimirIcon name="hinzufuegen" /> {t('photoSources.addMedia')}
          </>
        ) : (
          <>
            {t('photoSources.more')} <ProMark label={t('photoSources.pro')} />
          </>
        )}
      </button>
      <ShortTaskSheet
        open={open}
        title={t(
          linking
            ? 'photoSources.linkTitle'
            : devicePicker && !view
              ? 'photoSources.addMedia'
              : 'photoSources.title',
        )}
        closeLabel={t('taskSheets.close')}
        onClose={close}
        restoreFocusRef={trigger}
        className="photo-source-sheet"
        footer={
          <div className="photo-source-footer">
            <button type="button" className="secondary" onClick={close}>
              {t('taskSheets.close')}
            </button>
            {linking ? (
              <button
                type="button"
                disabled={!consent || !origin.trim() || !key || busy}
                onClick={() => void connect()}
              >
                {t(busy ? 'photoSources.connecting' : 'photoSources.connect')}
              </button>
            ) : view ? (
              <button
                type="button"
                disabled={!selected.length || busy}
                onClick={() => {
                  if (task.current)
                    void importItems(task.current, view, selected);
                }}
              >
                {t('photoSources.import')}
              </button>
            ) : canImport ? (
              <button
                type="button"
                disabled={
                  disabled ||
                  busy ||
                  remaining <= 0 ||
                  (source === 'immich' && !availability?.immichConnected)
                }
                onClick={() => void start()}
              >
                {t('photoSources.continue')}
              </button>
            ) : undefined}
          </div>
        }
      >
        {message ? <p role={busy ? 'status' : 'alert'}>{message}</p> : null}
        {linking ? (
          <>
            <p>{t('photoSources.privateLink')}</p>
            <details className="photo-source-setup-help">
              <summary>{t('photoSources.setupHelp')}</summary>
              <ol>
                <li>{t('photoSources.setupOpen')}</li>
                <li>{t('photoSources.setupKey')}</li>
                <li>{t('photoSources.setupPermissions')}</li>
              </ol>
              <p>{t('photoSources.setupFallback')}</p>
            </details>
            <label className="field-group">
              {t('photoSources.address')}
              <input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoComplete="off"
                value={origin}
                disabled={busy}
                onChange={(event) => setOrigin(event.target.value)}
                aria-describedby="immich-address-hint"
              />
            </label>
            <p id="immich-address-hint" className="field-help">
              {t('photoSources.addressHint')}
            </p>
            <label className="field-group">
              {t('photoSources.key')}
              <input
                type="password"
                aria-describedby="immich-key-hint"
                autoComplete="off"
                value={key}
                disabled={busy}
                onChange={(event) => setKey(event.target.value)}
              />
            </label>
            <p id="immich-key-hint" className="field-help">
              {t('photoSources.keyIsNotPassword')}
            </p>
            <p className="field-help">{t('photoSources.permissions')}</p>
            <label className="photo-source-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(event) => setConsent(event.target.checked)}
              />
              {t('photoSources.linkConsent')}
            </label>
          </>
        ) : view && activeTask ? (
          <>
            <p role="status">
              {t('photoSources.selected', { count: selected.length })}
            </p>
            <p>{t('photoSources.limit', { count: remaining })}</p>
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
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void more()}
              >
                {t('photoSources.loadMore')}
              </button>
            ) : null}
          </>
        ) : (
          <>
            {devicePicker?.(close)}
            {availability && !availability.canImport ? (
              <p>{t('photoSources.proRequired')}</p>
            ) : null}
            {canImport ? (
              <fieldset disabled={busy} className="photo-source-options">
                <legend className="sr-only">{t('photoSources.title')}</legend>
                {availability?.googleAvailable ? (
                  <label>
                    <input
                      type="radio"
                      name="photo-source"
                      value="google"
                      checked={source === 'google'}
                      onChange={() => setSource('google')}
                    />
                    {t('photoSources.google')}
                  </label>
                ) : null}
                {availability?.immichConnected ? (
                  <label>
                    <input
                      type="radio"
                      name="photo-source"
                      value="immich"
                      checked={source === 'immich'}
                      onChange={() => setSource('immich')}
                    />
                    {t('photoSources.immich')}
                  </label>
                ) : null}
              </fieldset>
            ) : null}
            {canImport && !availability?.immichConnected ? (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setLinking(true);
                  setConsent(false);
                  setMessage('');
                }}
              >
                {t('photoSources.link')}
              </button>
            ) : null}
            {availability?.immichConnected ? (
              <div>
                <p>{availability.immichOrigin}</p>
                <button
                  type="button"
                  className="tertiary"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  {t('photoSources.disconnect')}
                </button>
              </div>
            ) : null}
            {canImport ? (
              <p>
                {t(
                  source === 'google'
                    ? 'photoSources.googleConsent'
                    : 'photoSources.consent',
                )}
              </p>
            ) : null}
          </>
        )}
      </ShortTaskSheet>
    </>
  );
}
