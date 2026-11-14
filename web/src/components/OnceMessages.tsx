import './FreeComposer.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { OnceMessageCreate } from '../api/generated/models/OnceMessageCreate';
import type { OnceSealedMessage } from '../api/generated/models/OnceSealedMessage';
import { authorDisplayName } from '../client/authorPresentation';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from '../client/notificationQueries';
import {
  base64Bytes,
  decryptOnce,
  deviceKey,
  encryptOnce,
  ONCE_TEXT_MAX_LENGTH,
  type OnceContent,
  type OnceDeviceKey,
  onceMediaBlob,
  prepareOnceAudio,
  prepareOncePhoto,
  removeDeviceKey,
} from '../client/onceMessageCrypto';
import {
  ONCE_CREATE_ROUTE,
  ONCE_ROUTE,
  type OnceEnvironment,
  onceMessagePath,
  useOnceEnvironment,
  useOnceInbox,
  useOnceStatus,
} from '../client/onceMessages';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { PRO_INFORMATION_ROUTE } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useVoiceRecorder } from '../client/useVoiceRecorder';
import { VOICE_ACCEPT, voiceFile, voiceTime } from '../client/voiceNotes';
import { useTranslation } from '../i18n';
import { AddActionContent } from './AddAction';
import { DraftExitPrompt } from './DraftExitPrompt';
import { EimirIcon } from './EimirIcon';
import { MediaActionGroup } from './MediaActionGroup';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { ShortTaskSheet } from './ShortTaskSheet';
import { TaskBackButton } from './TaskBackButton';
import { VoiceNotePlayer, VoiceWaveform } from './VoiceNotePlayer';
import './OnceMessages.css';

function EnvelopeIcon() {
  return <EimirIcon name="nachrichten" className="once-envelope" />;
}

export function OnceIncomingSignal() {
  const environment = useOnceEnvironment();
  return environment ? <IncomingSignal environment={environment} /> : null;
}

function IncomingSignal({ environment }: { environment: OnceEnvironment }) {
  const { t } = useTranslation();
  const inbox = useOnceInbox(environment);
  const first = inbox.data?.items[0];
  if (!first) return null;
  return (
    <section
      className="today-section once-signal"
      aria-label={t('onceMessages.title')}
    >
      <h2 className="today-section-title">{t('onceMessages.title')}</h2>
      <Link
        className="once-sealed-link"
        to={
          (inbox.data?.items.length ?? 0) > 1
            ? ONCE_ROUTE
            : onceMessagePath(first.id)
        }
      >
        <EnvelopeIcon />
        <span>
          <strong>
            {t('onceMessages.from', { name: authorDisplayName(first.sender) })}
          </strong>
          <span>{t('onceMessages.singleView')}</span>
        </span>
        <EimirIcon name="chevron-right" className="inline-icon" />
      </Link>
      {inbox.error ? (
        <p role="status">{t('onceMessages.refreshFailed')}</p>
      ) : null}
    </section>
  );
}

export function OnceMessagesPage({
  mode,
}: {
  mode: 'inbox' | 'compose' | 'read';
}) {
  const environment = useOnceEnvironment();
  const { messageId } = useParams();
  return environment ? (
    <OnceTask
      key={`${environment.scope}:${mode}:${messageId ?? ''}`}
      environment={environment}
      mode={mode}
      messageId={messageId}
    />
  ) : null;
}

interface MediaDraft {
  blob: Blob;
  kind: 'IMAGE' | 'AUDIO';
  url: string;
  description: string;
  duration?: number;
}

function OnceTask({
  environment,
  mode,
  messageId,
}: {
  environment: OnceEnvironment;
  mode: 'inbox' | 'compose' | 'read';
  messageId?: string;
}) {
  const { api, accountId, spaceId, scope } = environment;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const status = useOnceStatus(environment);
  const inbox = useOnceInbox(environment, mode === 'inbox');
  const sealed = useQuery({
    queryKey: ['once-sealed', scope, messageId],
    queryFn: async ({ signal }) => {
      try {
        return await api.getSealedOnceMessage(
          { spaceId, messageId: messageId ?? '' },
          { signal, cache: 'no-store' },
        );
      } catch (failure) {
        throw await normalizeClientError(failure);
      }
    },
    enabled: mode === 'read' && Boolean(messageId),
    gcTime: 0,
    retry: false,
  });
  const [localKey, setLocalKey] = useState<OnceDeviceKey>();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaDraft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [sentId, setSentId] = useState<string>();
  const [withdrawn, setWithdrawn] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [recording, setRecording] = useState(false);
  const [content, setContent] = useState<OnceContent | null>(null);
  const [viewUrl, setViewUrl] = useState<string>();
  const [ended, setEnded] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const attempt = useRef<OnceMessageCreate | null>(null);
  const openToken = useRef<string | null>(null);
  const viewUrlRef = useRef<string | undefined>(undefined);
  const viewTimer = useRef<number | undefined>(undefined);
  const photoPicker = useRef<HTMLInputElement>(null);
  const audioPicker = useRef<HTMLInputElement>(null);
  const returnToOrigin = () => requestReturn(originKey, '/today');
  const lifecycle = useTaskEditorLifecycle({
    isActive: mode === 'compose',
    isDirty: !sent && Boolean(text || media || attempt.current),
    isCloseBlocked: busy || recording,
    onClose: returnToOrigin,
  });
  const clearView = useCallback(() => {
    generation.current++;
    if (viewTimer.current !== undefined) window.clearTimeout(viewTimer.current);
    viewTimer.current = undefined;
    setContent(null);
    setViewUrl(undefined);
    setEnded(true);
    if (viewUrlRef.current) URL.revokeObjectURL(viewUrlRef.current);
    viewUrlRef.current = undefined;
    openToken.current = null;
  }, []);

  useEffect(() => {
    let active = true;
    void deviceKey(scope)
      .then((key) => {
        if (active) setLocalKey(key);
      })
      .catch(() => {
        if (active) setError('deviceUnavailable');
      });
    return () => {
      active = false;
    };
  }, [scope]);
  useEffect(
    () => () => {
      if (media?.url) URL.revokeObjectURL(media.url);
    },
    [media?.url],
  );
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden && mode === 'read') clearView();
    };
    const leave = () => {
      if (mode === 'read') clearView();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leave);
    return () => {
      mounted.current = false;
      generation.current++;
      if (viewTimer.current !== undefined)
        window.clearTimeout(viewTimer.current);
      if (viewUrlRef.current) URL.revokeObjectURL(viewUrlRef.current);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leave);
    };
  }, [mode, clearView]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['once-inbox', scope] });
    void queryClient.invalidateQueries({ queryKey: ['once-status', scope] });
    void queryClient.invalidateQueries({
      queryKey: notificationUnreadCountQueryKey(spaceId),
    });
    void queryClient.invalidateQueries({
      queryKey: notificationsListQueryKey(spaceId),
    });
  }

  async function showError(cause: unknown) {
    if (!mounted.current) return;
    if (
      cause instanceof Error &&
      [
        'photoInvalid',
        'mediaTooLarge',
        'audioInvalid',
        'deviceUnavailable',
        'invalidContent',
      ].includes(cause.message)
    ) {
      setError(cause.message);
      return;
    }
    const problem = await normalizeClientError(cause);
    if (mounted.current)
      setError(
        problem.code?.startsWith('ONCE_')
          ? problem.code
          : problem.kind === 'offline'
            ? 'offline'
            : 'failed',
      );
  }

  async function reception(enable: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (!navigator.onLine) throw new Error('offline');
      const key = enable ? await deviceKey(scope, true) : undefined;
      if (!mounted.current) return;
      await api.setOnceMessageReception(
        {
          spaceId,
          onceReceptionUpdate: {
            enabled: enable,
            expectedVersion: status.data?.receptionVersion ?? 0,
            deviceId: key?.id,
            publicJwk: key?.publicJwk,
          },
        },
        { cache: 'no-store' },
      );
      if (!mounted.current) return;
      if (!enable) await removeDeviceKey(scope);
      setLocalKey(key);
      setConfirmOff(false);
      refresh();
    } catch (cause) {
      await showError(cause);
      refresh();
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function selectMedia(file: File, kind: 'IMAGE' | 'AUDIO') {
    if (inFlight.current || attempt.current) return;
    const owner = ++generation.current;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const prepared =
        kind === 'IMAGE'
          ? { blob: await prepareOncePhoto(file), duration: undefined }
          : await prepareOnceAudio(voiceFile(file));
      if (owner !== generation.current || !mounted.current) return;
      setMedia({
        ...prepared,
        kind,
        url: URL.createObjectURL(prepared.blob),
        description: '',
      });
    } catch (cause) {
      await showError(cause);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const recorder = useVoiceRecorder((file) => {
    setRecording(false);
    void selectMedia(file, 'AUDIO');
  });

  async function send() {
    if (inFlight.current || (!attempt.current && !text.trim() && !media))
      return;
    const ownsTask = lifecycle.captureOwnership();
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (!navigator.onLine) {
        setError('offline');
        return;
      }
      if (!attempt.current) {
        const current = await api.getOnceMessageStatus(
          { spaceId },
          { cache: 'no-store' },
        );
        if (!ownsTask()) return;
        if (!current.canSend) {
          setError('proRequired');
          return;
        }
        if (
          !current.ownEnabled ||
          !current.partnerEnabled ||
          !current.partner ||
          !current.recipientDevices.length
        ) {
          setError('ONCE_RECEPTION_REQUIRED');
          return;
        }
        const requestId = crypto.randomUUID();
        const payload: OnceContent = {
          v: 1,
          spaceId,
          senderId: accountId,
          recipientId: current.partner.id,
          requestId,
          text: text.trim(),
          media: media
            ? {
                kind: media.kind,
                mime: media.blob.type,
                data: base64Bytes(
                  new Uint8Array(await media.blob.arrayBuffer()),
                ),
                description: media.description,
                duration: media.duration,
              }
            : undefined,
        };
        const envelope = await encryptOnce(payload, current.recipientDevices);
        if (!ownsTask()) return;
        attempt.current = {
          requestId,
          recipientId: current.partner.id,
          envelope: envelope as unknown as Record<string, unknown>,
        };
      }
      const result = await api.sendOnceMessage(
        { spaceId, onceMessageCreate: attempt.current },
        { cache: 'no-store' },
      );
      if (!ownsTask()) return;
      attempt.current = null;
      setText('');
      setMedia(undefined);
      setSentId(result.id);
      setSent(true);
      refresh();
    } catch (cause) {
      const problem = await normalizeClientError(cause);
      if (!ownsTask()) return;
      if (attempt.current && (!problem.status || problem.status >= 500))
        setError('uncertain');
      else {
        attempt.current = null;
        await showError(cause);
        refresh();
      }
    } finally {
      inFlight.current = false;
      if (ownsTask()) setBusy(false);
    }
  }

  async function open() {
    if (inFlight.current || !messageId || !sealed.data || ended) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const owner = ++generation.current;
    const token = openToken.current ?? crypto.randomUUID();
    openToken.current = token;
    try {
      if (!navigator.onLine) {
        setError('offline');
        return;
      }
      if (!localKey || !status.data?.ownDeviceIds.includes(localKey.id)) {
        setError('ONCE_DEVICE_UNAVAILABLE');
        return;
      }
      const opened = await api.openOnceMessage(
        { spaceId, messageId, onceClaim: { deviceId: localKey.id, token } },
        { cache: 'no-store' },
      );
      refresh();
      try {
        const decoded = await decryptOnce(opened.envelope, localKey, {
          spaceId,
          senderId: sealed.data.sender.id,
          recipientId: accountId,
          requestId: sealed.data.requestId,
        });
        if (owner !== generation.current || !mounted.current || document.hidden)
          return;
        if (decoded.media) {
          const url = URL.createObjectURL(onceMediaBlob(decoded.media));
          viewUrlRef.current = url;
          setViewUrl(url);
        }
        setContent(decoded);
        viewTimer.current = window.setTimeout(
          () => {
            if (mounted.current && owner === generation.current) clearView();
          },
          Math.min(
            300_000,
            Math.max(0, opened.viewUntil.getTime() - Date.now()),
          ),
        );
      } finally {
        // Clear server ciphertext even after a decoding failure or backgrounding.
        void api
          .acknowledgeOnceMessage(
            { spaceId, messageId, onceAcknowledgement: { token } },
            { cache: 'no-store' },
          )
          .catch(() => {});
      }
    } catch (cause) {
      if (owner === generation.current && mounted.current)
        await showError(cause);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function discard() {
    const targetId = messageId ?? sentId;
    if (inFlight.current || !targetId) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await api.discardOnceMessage(
        { spaceId, messageId: targetId },
        { cache: 'no-store' },
      );
      if (mounted.current) {
        setConfirmDiscard(false);
        if (sentId) {
          setWithdrawn(true);
          setSentId(undefined);
        } else clearView();
        refresh();
      }
    } catch (cause) {
      await showError(cause);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const receivingHere = Boolean(
    localKey && status.data?.ownDeviceIds.includes(localKey.id),
  );
  const editingDisabled = busy || Boolean(attempt.current);
  const visibleError =
    error &&
    t(`onceMessages.errors.${error}`, {
      defaultValue: t('onceMessages.errors.failed'),
    });
  const header = (
    <PageHeader
      title={t('onceMessages.title')}
      titleContext={mode === 'compose' ? <ProMark label="Pro" /> : undefined}
      before={
        <TaskBackButton
          disabled={busy}
          onClick={() => {
            if (mode === 'compose') lifecycle.requestClose();
            else {
              clearView();
              returnToOrigin();
            }
          }}
        />
      }
    />
  );
  const renderSealed = (item: OnceSealedMessage) => (
    <Link
      className="once-sealed-link"
      key={item.id}
      to={onceMessagePath(item.id)}
    >
      <EnvelopeIcon />
      <span>
        <strong>
          {t('onceMessages.from', { name: authorDisplayName(item.sender) })}
        </strong>
        <span>{t('onceMessages.singleView')}</span>
      </span>
      <EimirIcon name="chevron-right" className="inline-icon" />
    </Link>
  );

  return (
    <div className="page page-reading once-page">
      {header}
      {visibleError ? (
        <p className="once-error" role="alert">
          {visibleError}
        </p>
      ) : null}
      {mode === 'read' ? (
        <>
          {content ? (
            <section
              className="once-reading"
              aria-label={t('onceMessages.message')}
            >
              <p className="once-from">
                {sealed.data
                  ? t('onceMessages.from', {
                      name: authorDisplayName(sealed.data.sender),
                    })
                  : ''}
              </p>
              {content.media?.kind === 'IMAGE' && viewUrl ? (
                <img
                  className="once-photo"
                  src={viewUrl}
                  alt={content.media.description || t('onceMessages.photo')}
                />
              ) : null}
              {content.text ? (
                <p className="once-words">{content.text}</p>
              ) : null}
              {content.media?.kind === 'AUDIO' && viewUrl ? (
                <VoiceNotePlayer
                  src={viewUrl}
                  duration={content.media.duration}
                  title={t('onceMessages.voice')}
                />
              ) : null}
              <button
                type="button"
                className="primary"
                onClick={() => {
                  clearView();
                  returnToOrigin();
                }}
              >
                {t('onceMessages.close')}
              </button>
            </section>
          ) : ended ? (
            <div role="status">
              <p>{t('onceMessages.ended')}</p>
              <button
                className="secondary"
                type="button"
                onClick={returnToOrigin}
              >
                {t('onceMessages.back')}
              </button>
            </div>
          ) : (
            <>
              {sealed.isPending ? (
                <p role="status">{t('onceMessages.loading')}</p>
              ) : sealed.error ? (
                clientProblemKind(sealed.error) === 'notFound' ? (
                  <p role="status">{t('onceMessages.unavailable')}</p>
                ) : (
                  <ProblemState
                    error={sealed.error}
                    onRetry={() => void sealed.refetch()}
                  />
                )
              ) : sealed.data ? (
                <section className="once-sealed-reader">
                  <p>
                    {t('onceMessages.from', {
                      name: authorDisplayName(sealed.data.sender),
                    })}
                  </p>
                  <EnvelopeIcon />
                  <p>{t('onceMessages.openConsequence')}</p>
                  <p className="once-support">{t('onceMessages.copyLimit')}</p>
                  {!receivingHere ? (
                    <p>{t('onceMessages.originalDevice')}</p>
                  ) : null}
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !receivingHere}
                    onClick={() => void open()}
                  >
                    {t(busy ? 'onceMessages.opening' : 'onceMessages.open')}
                  </button>
                  <button
                    type="button"
                    className="tertiary"
                    disabled={busy}
                    onClick={() => setConfirmDiscard(true)}
                  >
                    {t('onceMessages.discard')}
                  </button>
                </section>
              ) : null}
            </>
          )}
        </>
      ) : sent ? (
        <section className="once-result" role="status">
          <EnvelopeIcon />
          <h2>
            {t(withdrawn ? 'onceMessages.withdrawn' : 'onceMessages.sent')}
          </h2>
          {!withdrawn ? <p>{t('onceMessages.sentLifetime')}</p> : null}
          {sentId ? (
            <button
              type="button"
              className="tertiary"
              disabled={busy}
              onClick={() => setConfirmDiscard(true)}
            >
              {t('onceMessages.withdraw')}
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            onClick={() => lifecycle.closeConfirmed()}
          >
            {t('onceMessages.back')}
          </button>
        </section>
      ) : (
        <>
          {status.isPending ? (
            <p role="status">{t('onceMessages.loading')}</p>
          ) : status.error ? (
            <ProblemState
              error={status.error}
              onRetry={() => void status.refetch()}
            />
          ) : status.data ? (
            <>
              {mode === 'inbox' || !status.data.ownEnabled || !receivingHere ? (
                <section
                  className="once-reception"
                  aria-labelledby="once-reception-title"
                >
                  <h2 id="once-reception-title">
                    {t('onceMessages.reception')}
                  </h2>
                  {!status.data.ownEnabled || !receivingHere ? (
                    <>
                      <p>{t('onceMessages.consent')}</p>
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => void reception(true)}
                      >
                        {t('onceMessages.enable')}
                      </button>
                    </>
                  ) : (
                    <>
                      <p>{t('onceMessages.enabled')}</p>
                      <button
                        className="tertiary"
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmOff(true)}
                      >
                        {t('onceMessages.disable')}
                      </button>
                    </>
                  )}
                </section>
              ) : null}
              {mode === 'inbox' ? (
                <>
                  {inbox.error ? (
                    <ProblemState
                      error={inbox.error}
                      onRetry={() => void inbox.refetch()}
                    />
                  ) : null}
                  {inbox.data?.items.map(renderSealed)}
                  {inbox.data?.items.length === 0 ? (
                    <p>{t('onceMessages.empty')}</p>
                  ) : null}
                  <Link className="button-link primary" to={ONCE_CREATE_ROUTE}>
                    {t('onceMessages.compose')}
                  </Link>
                </>
              ) : !status.data.canSend ? (
                <section>
                  <ProMark label="Pro" />
                  <p>{t('onceMessages.pro')}</p>
                  <Link
                    className="button-link secondary"
                    to={PRO_INFORMATION_ROUTE}
                  >
                    {t('onceMessages.discoverPro')}
                  </Link>
                </section>
              ) : !status.data.partner ? (
                <p>{t('onceMessages.noPartner')}</p>
              ) : !status.data.partnerEnabled ||
                !status.data.recipientDevices.length ? (
                <p>{t('onceMessages.partnerConsent')}</p>
              ) : status.data.ownEnabled ? (
                <form
                  className="once-composer free-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                  }}
                >
                  <p>
                    {t('onceMessages.for', {
                      name: authorDisplayName(status.data.partner),
                    })}
                  </p>
                  <label htmlFor="once-text">{t('onceMessages.message')}</label>
                  <textarea
                    id="once-text"
                    value={text}
                    maxLength={ONCE_TEXT_MAX_LENGTH}
                    disabled={editingDisabled}
                    onChange={(event) => setText(event.currentTarget.value)}
                    autoComplete="off"
                  />
                  <MediaActionGroup>
                    {media ? (
                      <div className="once-media-draft">
                        {media.kind === 'IMAGE' ? (
                          <>
                            <img
                              className="once-photo"
                              src={media.url}
                              alt={media.description || t('onceMessages.photo')}
                            />
                            <label htmlFor="once-description">
                              {t('onceMessages.description')}
                            </label>
                            <input
                              id="once-description"
                              value={media.description}
                              maxLength={300}
                              disabled={editingDisabled}
                              onChange={(event) =>
                                setMedia({
                                  ...media,
                                  description: event.currentTarget.value,
                                })
                              }
                            />
                          </>
                        ) : (
                          <VoiceNotePlayer
                            src={media.url}
                            duration={media.duration}
                            title={t('onceMessages.voice')}
                          />
                        )}
                        <button
                          className="tertiary"
                          type="button"
                          disabled={editingDisabled}
                          onClick={() => setMedia(undefined)}
                        >
                          {t('onceMessages.removeMedia')}
                        </button>
                      </div>
                    ) : null}
                    <div className="once-attachments">
                      <button
                        type="button"
                        className="add-action"
                        disabled={editingDisabled}
                        onClick={() => photoPicker.current?.click()}
                      >
                        <AddActionContent label={t('onceMessages.photo')} />
                      </button>
                      <button
                        type="button"
                        className="add-action"
                        disabled={editingDisabled}
                        onClick={() => {
                          setRecording(true);
                          void recorder.start();
                        }}
                      >
                        <AddActionContent label={t('onceMessages.record')} />
                      </button>
                      <button
                        type="button"
                        className="add-action"
                        disabled={editingDisabled}
                        onClick={() => audioPicker.current?.click()}
                      >
                        <AddActionContent
                          label={t('onceMessages.importVoice')}
                        />
                      </button>
                    </div>
                  </MediaActionGroup>
                  <input
                    type="file"
                    ref={photoPicker}
                    className="visually-hidden-input"
                    tabIndex={-1}
                    aria-label={t('onceMessages.photo')}
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (file) void selectMedia(file, 'IMAGE');
                    }}
                  />
                  <input
                    type="file"
                    ref={audioPicker}
                    className="visually-hidden-input"
                    tabIndex={-1}
                    aria-label={t('onceMessages.importVoice')}
                    accept={VOICE_ACCEPT}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (file) void selectMedia(file, 'AUDIO');
                    }}
                  />
                  <p className="once-support">
                    {t('onceMessages.sendConsequence')}
                  </p>
                  <button
                    className="primary"
                    type="submit"
                    disabled={
                      busy || (!attempt.current && !text.trim() && !media)
                    }
                  >
                    {t(
                      busy
                        ? 'onceMessages.sending'
                        : attempt.current
                          ? 'onceMessages.checkSend'
                          : 'onceMessages.send',
                    )}
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
        </>
      )}
      <DraftExitPrompt
        open={lifecycle.showDiscardConfirm}
        onKeep={lifecycle.keepEditing}
        onDiscard={lifecycle.closeConfirmed}
      />
      <ShortTaskSheet
        open={confirmOff}
        isCloseBlocked={busy}
        title={t('onceMessages.disable')}
        onClose={() => setConfirmOff(false)}
      >
        <p>{t('onceMessages.disableConsequence')}</p>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void reception(false)}
        >
          {t('onceMessages.disable')}
        </button>
      </ShortTaskSheet>
      <ShortTaskSheet
        open={confirmDiscard}
        title={t(sentId ? 'onceMessages.withdraw' : 'onceMessages.discard')}
        isCloseBlocked={busy}
        onClose={() => setConfirmDiscard(false)}
      >
        <p>
          {t(
            sentId
              ? 'onceMessages.withdrawConsequence'
              : 'onceMessages.discardConsequence',
          )}
        </p>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void discard()}
        >
          {t(
            busy
              ? 'onceMessages.removing'
              : sentId
                ? 'onceMessages.withdraw'
                : 'onceMessages.discard',
          )}
        </button>
      </ShortTaskSheet>
      <ShortTaskSheet
        open={recording}
        title={t('onceMessages.record')}
        onClose={() => {
          recorder.cancel();
          setRecording(false);
        }}
      >
        <p role="status">
          {t(
            recorder.phase === 'requesting'
              ? 'voiceNotes.requesting'
              : 'voiceNotes.recording',
          )}
        </p>
        <output>{voiceTime(recorder.elapsed)}</output>
        <VoiceWaveform peaks={recorder.wave} />
        {recorder.error ? (
          <p role="alert">{t(`voiceNotes.${recorder.error}`)}</p>
        ) : null}
        <button
          type="button"
          className="primary"
          disabled={recorder.phase !== 'recording'}
          onClick={recorder.stop}
        >
          {t('voiceNotes.stop')}
        </button>
      </ShortTaskSheet>
    </div>
  );
}
