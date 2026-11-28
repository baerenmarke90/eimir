import { useQueries } from '@tanstack/react-query';
import {
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PlansApi } from '../api/generated/apis/PlansApi';
import type { CalendarOption } from '../api/generated/models/CalendarOption';
import type { CalendarSyncView } from '../api/generated/models/CalendarSyncView';
import { Configuration } from '../client/apiConfiguration';
import {
  calendarSyncErrorKey,
  calendarSyncStatus,
  openGoogleConsent,
  openGoogleConsentHere,
  useCalendarSync,
} from '../client/calendarSync';
import { isClientOnline } from '../client/connectivity';
import { planListTitle } from '../client/discreetPlans';
import { proPaywallPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { isCapacitorNative } from '../pwa';
import { EimirIcon } from './EimirIcon';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { ShortTaskSheet } from './ShortTaskSheet';
import { UiState } from './UiState';
import './CalendarSyncSettings.css';

type Props = {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
};

type Step =
  | { kind: 'closed' }
  | { kind: 'credentials' }
  | {
      kind: 'choose';
      connectionId: string;
      label: string | null;
      calendars: CalendarOption[];
      switching: boolean;
    };

const GOOGLE_RETURN = 'calendarGoogle';
const CONFIRMATION_SECONDS = 6;

/**
 * Settings › Calendar (#1895): one shared target calendar per Space. The
 * sponsor alone sees and manages credentials; both partners see the shared
 * status and may pause or end the sync.
 */
export function CalendarSyncSettings(props: Props) {
  const { t } = useTranslation();
  const { api, view, error, loading, replace, refresh } =
    useCalendarSync(props);
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: 'closed' });
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [problem, setProblem] = useState('');
  const [awaitingGoogle, setAwaitingGoogle] = useState(false);
  const inFlight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Consent returns (same tab on the Web, app link in the Android app) with a
  // fixed outcome code only; read the pending account it created.
  const googleReturn = searchParams.get(GOOGLE_RETURN);
  useEffect(() => {
    if (!googleReturn) return;
    setAwaitingGoogle(false);
    void refreshRef.current().catch(() => {});
    if (googleReturn === 'denied' || googleReturn === 'failed')
      setProblem(t(`calendarSync.google.return.${googleReturn}`));
    if (googleReturn === 'expired')
      setProblem(t('calendarSync.errors.CALENDAR_GOOGLE_EXPIRED'));
    const next = new URLSearchParams(searchParams);
    next.delete(GOOGLE_RETURN);
    setSearchParams(next, { replace: true });
  }, [googleReturn, searchParams, setSearchParams, t]);

  // Fallback while the system browser is open: read the result on return,
  // also when the person closes the browser without finishing.
  useEffect(() => {
    if (!awaitingGoogle) return;
    const back = () => {
      if (document.visibilityState === 'visible')
        void refresh().catch(() => {});
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [awaitingGoogle, refresh]);

  useEffect(() => {
    if (!confirmation) return;
    const timer = window.setTimeout(
      () => setConfirmation(false),
      CONFIRMATION_SECONDS * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [confirmation]);

  async function run(action: () => Promise<CalendarSyncView | void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem('');
    try {
      const next = await action();
      if (next) replace(next);
    } catch (failure) {
      const key = await calendarSyncErrorKey(failure);
      setProblem(t(key));
      if (key.endsWith('CALENDAR_TARGET_CHANGED'))
        await refresh().catch(() => {});
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (loading)
    return <UiState kind="loading" title={t('states.loading.title')} compact />;
  if (error || !view)
    return (
      <ProblemState
        error={error}
        onRetry={() => void refresh().catch(() => {})}
      />
    );
  if (!view.available)
    return (
      <section className="settings-functional-panel calendar-sync">
        <p>{t('calendarSync.unavailable')}</p>
      </section>
    );

  const target = view.target ?? null;
  const ifMatch = JSON.stringify(view.targetToken);
  const offline = !isClientOnline();
  const sponsorConnection = view.connections.find(
    (connection) => connection.id === target?.connectionId,
  );
  const openConnections = view.connections.filter(
    (connection) =>
      connection.status === 'ACTIVE' && connection.id !== target?.connectionId,
  );
  const pendingGoogle = view.connections.filter(
    (connection) => connection.status === 'PENDING',
  );

  async function startGoogle() {
    if (!isCapacitorNative()) {
      // Web: Google in this tab, then straight back to this page.
      await run(async () => {
        const started = await api.startGoogleCalendarConnection({
          spaceId: props.spaceId,
          googleCalendarStartRequest: { returnTo: 'web' },
        });
        openGoogleConsentHere(started.authorizationUrl);
      });
      return;
    }
    await run(async () => {
      const started = await api.startGoogleCalendarConnection({
        spaceId: props.spaceId,
        googleCalendarStartRequest: { returnTo: 'app' },
      });
      await openGoogleConsent(started.authorizationUrl, null);
      setAwaitingGoogle(true);
    });
  }

  async function confirmGoogle(connectionId: string) {
    await run(async () => {
      const confirmed = await api.confirmCalendarConnection({
        spaceId: props.spaceId,
        connectionId,
      });
      setAwaitingGoogle(false);
      setStep({
        kind: 'choose',
        connectionId: confirmed.connection.id,
        label: confirmed.connection.label,
        calendars: confirmed.calendars,
        switching: Boolean(target),
      });
      await refresh().catch(() => {});
    });
  }

  async function chooseFrom(
    connectionId: string,
    label: string | null,
    switching: boolean,
  ) {
    await run(async () => {
      const list = await api.listConnectionCalendars({
        spaceId: props.spaceId,
        connectionId,
      });
      setStep({
        kind: 'choose',
        connectionId,
        label,
        calendars: list.calendars,
        switching,
      });
    });
  }

  const pendingCards = pendingGoogle.map((connection) => (
    <section
      key={connection.id}
      className="calendar-sync-confirm"
      aria-label={t('calendarSync.google.confirmTitle')}
    >
      <strong>{t('calendarSync.google.confirmTitle')}</strong>
      <p>{t('calendarSync.google.confirmBody', { label: connection.label })}</p>
      <div className="calendar-sync-row">
        <button
          type="button"
          disabled={busy || offline}
          onClick={() => void confirmGoogle(connection.id)}
        >
          {t('calendarSync.google.confirm')}
        </button>
        <button
          type="button"
          className="tertiary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api.removeCalendarConnection({
                spaceId: props.spaceId,
                connectionId: connection.id,
              });
              return api.getCalendarSync({ spaceId: props.spaceId });
            })
          }
        >
          {t('common.cancel')}
        </button>
      </div>
    </section>
  ));

  return (
    <section
      className="settings-functional-panel calendar-sync"
      aria-labelledby="calendar-sync-title"
    >
      <h2 id="calendar-sync-title">
        {t('calendarSync.sharedHeading')}{' '}
        <ProMark label={t('calendarSync.pro')} />
      </h2>
      <p className="calendar-sync-confirmation" role="status">
        {confirmation ? `✓ ${t('calendarSync.connected.title')}` : ''}
      </p>
      {problem && step.kind === 'closed' ? <p role="alert">{problem}</p> : null}
      {view.canSync ? pendingCards : null}
      {awaitingGoogle && pendingGoogle.length === 0 ? (
        <p role="status">{t('calendarSync.google.waiting')}</p>
      ) : null}

      {target ? (
        <TargetState
          {...props}
          api={api}
          view={view}
          busy={busy || offline}
          ifMatch={ifMatch}
          run={run}
          onChooseCalendar={() =>
            sponsorConnection
              ? void chooseFrom(
                  sponsorConnection.id,
                  sponsorConnection.label,
                  true,
                )
              : setStep({
                  kind: 'choose',
                  connectionId: '',
                  label: null,
                  calendars: [],
                  switching: true,
                })
          }
          onReconnect={() =>
            target.service === 'GOOGLE'
              ? void startGoogle()
              : setStep({ kind: 'credentials' })
          }
        />
      ) : view.canSync ? (
        <>
          <p>{t('calendarSync.sharedIntro')}</p>
          {openConnections.map((connection) => (
            <button
              key={connection.id}
              type="button"
              className="calendar-sync-choice"
              disabled={busy || offline}
              onClick={() =>
                void chooseFrom(connection.id, connection.label, false)
              }
            >
              <span>
                <strong>
                  {t(`calendarSync.providers.${connection.service}`)}
                </strong>
                <span>{connection.label}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          {view.services.map((provider) => (
            <button
              key={provider}
              ref={provider === 'CALDAV' ? trigger : undefined}
              type="button"
              className="calendar-sync-choice"
              disabled={busy || offline}
              onClick={() =>
                provider === 'GOOGLE'
                  ? void startGoogle()
                  : setStep({ kind: 'credentials' })
              }
            >
              <span>
                <strong>{t(`calendarSync.providers.${provider}`)}</strong>
                <span>{t(`calendarSync.providers.${provider}_hint`)}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          <p className="field-help">{t('calendarSync.handoffStaysFree')}</p>
        </>
      ) : (
        <div className="calendar-sync-free">
          <p>{t('calendarSync.proRequired')}</p>
          <Link to={proPaywallPath('calendar')}>
            {t('proPaywall.contextAction')}
          </Link>
          <p className="field-help">{t('calendarSync.handoffStaysFree')}</p>
        </div>
      )}

      <CalDavSheet
        open={step.kind === 'credentials'}
        busy={busy}
        problem={problem}
        restoreFocusRef={trigger}
        onClose={() => {
          if (!busy) {
            setStep({ kind: 'closed' });
            setProblem('');
          }
        }}
        onSubmit={(values) =>
          run(async () => {
            const created = await api.connectCalDavCalendar({
              spaceId: props.spaceId,
              calDavConnectionCreate: { ...values, consent: true },
            });
            setStep({
              kind: 'choose',
              connectionId: created.connection.id,
              label: created.connection.label,
              calendars: created.calendars,
              switching: Boolean(target),
            });
            await refresh().catch(() => {});
          })
        }
      />
      <ChooseSheet
        step={step.kind === 'choose' ? step : null}
        busy={busy}
        problem={problem}
        restoreFocusRef={trigger}
        services={view.services}
        onClose={() => {
          if (!busy) {
            setStep({ kind: 'closed' });
            setProblem('');
          }
        }}
        onOtherConnection={(service) => {
          setStep({ kind: 'closed' });
          if (service === 'GOOGLE') void startGoogle();
          else setStep({ kind: 'credentials' });
        }}
        onConfirm={(connectionId, calendarRef) =>
          run(async () => {
            const next = await api.setCalendarSyncTarget({
              spaceId: props.spaceId,
              ifMatch,
              spaceCalendarTargetSave: { connectionId, calendarRef },
            });
            setStep({ kind: 'closed' });
            setConfirmation(true);
            return next;
          })
        }
      />
    </section>
  );
}

function TargetState(
  props: Props & {
    api: ReturnType<typeof useCalendarSync>['api'];
    view: CalendarSyncView;
    busy: boolean;
    ifMatch: string;
    run: (action: () => Promise<CalendarSyncView | void>) => Promise<void>;
    onChooseCalendar: () => void;
    onReconnect: () => void;
  },
) {
  const { t } = useTranslation();
  const { api, spaceId, view, busy, ifMatch, run } = props;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const target = view.target!;
  const status = calendarSyncStatus(target);
  const provider = t(`calendarSync.providers.${target.service}`);
  const name = target.calendarPrimary
    ? t('calendarSync.target.primaryCalendar')
    : target.calendarName;
  const plansApi = useMemo(
    () =>
      new PlansApi(
        new Configuration({
          basePath: props.apiBaseUrl,
          headers: { Authorization: `Bearer ${props.accessToken}` },
        }),
      ),
    [props.apiBaseUrl, props.accessToken],
  );
  const titles = useQueries({
    queries: target.conflicts.map((conflict) => ({
      queryKey: ['calendar-sync-plan-title', spaceId, conflict.planId],
      queryFn: () => plansApi.getPlan({ spaceId, planId: conflict.planId }),
      retry: false,
      staleTime: 60_000,
    })),
  });
  const lastSuccess = target.lastSuccessAt
    ? new Intl.DateTimeFormat(resolvedLocale(), {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(target.lastSuccessAt)
    : null;
  // Nothing confirmed yet is "ready", never "synced".
  const ready =
    status === 'synced' &&
    target.syncedCount === 0 &&
    target.pendingCount === 0;
  const statusText = ready
    ? t('calendarSync.status.ready')
    : status === 'synced' && lastSuccess
      ? t('calendarSync.status.syncedAt', { time: lastSuccess })
      : t(`calendarSync.status.${status}`);
  // The card names who connected it, never the account address or server
  // (#2063: couples should not see technical connection details here).
  const meta = target.sponsoredByMe
    ? t('calendarSync.target.viaYou', { provider })
    : t('calendarSync.target.via', {
        provider,
        name: target.sponsor.displayName,
      });

  return (
    <>
      <article
        className="calendar-sync-card"
        aria-labelledby="calendar-sync-name"
      >
        <div className="calendar-sync-card-head">
          <span className="calendar-sync-mark" aria-hidden="true">
            <EimirIcon name="kalender" />
          </span>
          <div className="calendar-sync-card-title">
            <h3 id="calendar-sync-name" className="calendar-sync-name">
              {name}
            </h3>
            <p className="calendar-sync-meta">{meta}</p>
          </div>
        </div>
        <p
          className={`calendar-sync-status calendar-sync-status-${ready ? 'ready' : status}`}
          role="status"
        >
          <span aria-hidden="true" className="calendar-sync-dot" />
          {statusText}
        </p>
        {status === 'broken' ? (
          <p>
            {target.sponsoredByMe
              ? t('calendarSync.status.brokenHint')
              : t('calendarSync.status.brokenPartner', {
                  name: target.sponsor.displayName,
                })}
          </p>
        ) : null}
        {target.status === 'SUSPENDED' &&
        target.statusReason === 'CALENDAR_UNAVAILABLE' ? (
          <p>{t('calendarSync.status.calendarGone')}</p>
        ) : null}
        {target.syncedCount > 0 ? (
          <p className="calendar-sync-meta">
            {t('calendarSync.target.synced', { count: target.syncedCount })}
          </p>
        ) : (
          <p className="calendar-sync-meta">
            {t('calendarSync.target.explain')}
          </p>
        )}
        {target.keptCount > 0 ? (
          <p className="calendar-sync-meta">
            {t('calendarSync.target.kept', { count: target.keptCount })}
          </p>
        ) : null}

        {target.conflicts.length > 0 ? (
          <ul
            className="calendar-sync-conflicts"
            aria-label={t('calendarSync.status.attention')}
          >
            {target.conflicts.map((conflict, index) => {
              const plan = titles[index]?.data;
              const title = plan
                ? planListTitle(plan, t)
                : t('calendarSync.conflict.unknownPlan');
              const resolve = (action: 'OVERWRITE' | 'DETACH') =>
                run(async () => {
                  await api.resolvePlanCalendarConflict({
                    spaceId,
                    planId: conflict.planId,
                    calendarConflictResolution: { action },
                  });
                  return api.getCalendarSync({ spaceId });
                });
              return (
                <li key={conflict.planId}>
                  <p>
                    {t(`calendarSync.conflict.${conflict.reason}`, { title })}
                  </p>
                  <div className="calendar-sync-row">
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void resolve('OVERWRITE')}
                    >
                      {t('calendarSync.conflict.overwrite')}
                    </button>
                    <button
                      type="button"
                      className="tertiary"
                      disabled={busy}
                      onClick={() => void resolve('DETACH')}
                    >
                      {t('calendarSync.conflict.detach')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="calendar-sync-row">
          {status === 'paused' ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  api.resumeCalendarSyncTarget({ spaceId, ifMatch }),
                )
              }
            >
              {t('calendarSync.actions.resume')}
            </button>
          ) : status === 'broken' && target.sponsoredByMe ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={props.onReconnect}
            >
              {t('calendarSync.actions.reconnect')}
            </button>
          ) : status !== 'broken' && view.canSync ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-busy={busy}
              onClick={() =>
                void run(() => api.requestCalendarSync({ spaceId }))
              }
            >
              {t('calendarSync.actions.syncNow')}
            </button>
          ) : status === 'proPaused' ? (
            <Link to={proPaywallPath('calendar')}>
              {t('proPaywall.contextAction')}
            </Link>
          ) : null}
          {view.canSync ? (
            <button
              type="button"
              className="tertiary"
              disabled={busy}
              onClick={props.onChooseCalendar}
            >
              {t('calendarSync.actions.changeCalendar')}
            </button>
          ) : null}
        </div>
      </article>

      <details className="calendar-sync-options">
        <summary>{t('calendarSync.actions.moreOptions')}</summary>
        <div className="calendar-sync-options-body">
          {target.status === 'ACTIVE' ? (
            <button
              type="button"
              className="tertiary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  api.pauseCalendarSyncTarget({ spaceId, ifMatch }),
                )
              }
            >
              {t('calendarSync.actions.pause')}
            </button>
          ) : null}
          {!confirmEnd ? (
            <button
              type="button"
              className="tertiary"
              disabled={busy}
              onClick={() => setConfirmEnd(true)}
            >
              {t('calendarSync.actions.end')}
            </button>
          ) : (
            <section
              className="calendar-sync-confirm"
              aria-label={t('calendarSync.actions.end')}
            >
              <p>{t('calendarSync.actions.endConfirm')}</p>
              <div className="calendar-sync-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const next = await api.endCalendarSyncTarget({
                        spaceId,
                        ifMatch,
                      });
                      setConfirmEnd(false);
                      return next;
                    })
                  }
                >
                  {t('calendarSync.actions.endConfirmAction')}
                </button>
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => setConfirmEnd(false)}
                >
                  {t('calendarSync.actions.keepSyncing')}
                </button>
              </div>
            </section>
          )}
          {target.sponsoredByMe && target.connectionId ? (
            <button
              type="button"
              className="tertiary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.removeCalendarConnection({
                    spaceId,
                    connectionId: target.connectionId!,
                  });
                  return api.getCalendarSync({ spaceId });
                })
              }
            >
              {t('calendarSync.actions.disconnectProvider', { provider })}
            </button>
          ) : null}
          <p className="calendar-sync-meta">
            {t('calendarSync.actions.eventsStay')}
          </p>
        </div>
      </details>
    </>
  );
}

function CalDavSheet(props: {
  open: boolean;
  busy: boolean;
  problem: string;
  restoreFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSubmit: (values: {
    url: string;
    username: string;
    password: string;
  }) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [url, setUrl] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const ready =
    url.trim().length > 10 && username.trim() && password && consent;
  return (
    <ShortTaskSheet
      id={`${id}-caldav`}
      open={props.open}
      title={t('calendarSync.caldav.sheetTitle')}
      restoreFocusRef={props.restoreFocusRef}
      isCloseBlocked={props.busy}
      onClose={() => {
        setPassword('');
        setConsent(false);
        props.onClose();
      }}
      footer={
        <button
          type="submit"
          form={`${id}-caldav-form`}
          disabled={!ready || props.busy}
          aria-busy={props.busy}
        >
          {props.busy
            ? t('calendarSync.caldav.checking')
            : t('calendarSync.caldav.check')}
        </button>
      }
    >
      <form
        id={`${id}-caldav-form`}
        className="form-grid calendar-sync-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !props.busy)
            props.onSubmit({
              url: url.trim(),
              username: username.trim(),
              password,
            });
        }}
      >
        <p>{t('calendarSync.caldav.privateConnection')}</p>
        <label htmlFor={`${id}-url`}>{t('calendarSync.caldav.address')}</label>
        <input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="off"
          spellCheck={false}
          value={url}
          aria-describedby={`${id}-url-hint`}
          onChange={(event) => setUrl(event.target.value)}
        />
        <p id={`${id}-url-hint`} className="field-help">
          {t('calendarSync.caldav.addressHint')}
        </p>
        <label htmlFor={`${id}-user`}>
          {t('calendarSync.caldav.username')}
        </label>
        <input
          id={`${id}-user`}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label htmlFor={`${id}-password`}>
          {t('calendarSync.caldav.password')}
        </label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="current-password"
          value={password}
          aria-describedby={`${id}-password-hint`}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p id={`${id}-password-hint`} className="field-help">
          {t('calendarSync.caldav.passwordHint')}
        </p>
        <label className="choice-row">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>{t('calendarSync.caldav.consent')}</span>
        </label>
        {props.problem ? (
          <p role="alert" className="field-error">
            {props.problem}
          </p>
        ) : null}
      </form>
    </ShortTaskSheet>
  );
}

function ChooseSheet(props: {
  step: {
    connectionId: string;
    label: string | null;
    calendars: CalendarOption[];
    switching: boolean;
  } | null;
  busy: boolean;
  problem: string;
  services: Array<'CALDAV' | 'GOOGLE'>;
  restoreFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOtherConnection: (service: 'CALDAV' | 'GOOGLE') => void;
  onConfirm: (connectionId: string, calendarRef: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [selected, setSelected] = useState('');
  const step = props.step;
  const writable =
    step?.calendars.filter((calendar) => calendar.writable) ?? [];
  const chosen = selected || (writable.length === 1 ? writable[0].ref : '');
  return (
    <ShortTaskSheet
      id={`${id}-choose`}
      open={step !== null}
      title={t('calendarSync.choose.title')}
      restoreFocusRef={props.restoreFocusRef}
      isCloseBlocked={props.busy}
      onClose={() => {
        setSelected('');
        props.onClose();
      }}
      footer={
        step && step.calendars.length > 0 ? (
          <button
            type="button"
            disabled={!chosen || props.busy}
            aria-busy={props.busy}
            onClick={() =>
              step && chosen && props.onConfirm(step.connectionId, chosen)
            }
          >
            {props.busy
              ? t('calendarSync.choose.saving')
              : t('calendarSync.choose.confirm')}
          </button>
        ) : undefined
      }
    >
      {step?.label ? <p className="calendar-sync-meta">{step.label}</p> : null}
      {step && step.calendars.length > 0 ? (
        <fieldset className="calendar-sync-calendars">
          <legend className="sr-only">{t('calendarSync.choose.title')}</legend>
          {step.calendars.map((calendar) => (
            <label key={calendar.ref} className="choice-row">
              <input
                type="radio"
                name={`${id}-calendar`}
                value={calendar.ref}
                checked={chosen === calendar.ref}
                disabled={!calendar.writable || props.busy}
                onChange={() => setSelected(calendar.ref)}
              />
              <span>
                {calendar.primary
                  ? t('calendarSync.target.primaryCalendar')
                  : calendar.name}
                {!calendar.writable ? (
                  <span className="field-help">
                    {' '}
                    · {t('calendarSync.choose.readOnly')}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {step?.switching ? (
        <div className="calendar-sync-other">
          <p className="calendar-sync-other-title">
            {t('calendarSync.choose.otherConnection')}
          </p>
          {props.services.map((service) => (
            <button
              key={service}
              type="button"
              className="tertiary"
              disabled={props.busy}
              onClick={() => props.onOtherConnection(service)}
            >
              {t(`calendarSync.choose.connect_${service}`)}
            </button>
          ))}
        </div>
      ) : null}
      {props.problem ? (
        <p role="alert" className="field-error">
          {props.problem}
        </p>
      ) : null}
    </ShortTaskSheet>
  );
}
