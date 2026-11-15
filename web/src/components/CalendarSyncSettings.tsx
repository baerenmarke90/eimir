import { useQueries } from '@tanstack/react-query';
import { type RefObject, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlansApi } from '../api/generated/apis/PlansApi';
import type { CalendarOption } from '../api/generated/models/CalendarOption';
import type { CalendarSyncView } from '../api/generated/models/CalendarSyncView';
import { Configuration } from '../client/apiConfiguration';
import {
  calendarSyncErrorKey,
  calendarSyncStatus,
  useCalendarSync,
} from '../client/calendarSync';
import { isClientOnline } from '../client/connectivity';
import { planListTitle } from '../client/discreetPlans';
import { proPaywallPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
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
  | { kind: 'choose'; connectionId: string; calendars: CalendarOption[] };

/**
 * Settings › Calendar (#1895): one shared target calendar per Space. The
 * sponsor alone sees and manages credentials; both partners see the shared
 * status and may pause or end the sync.
 */
export function CalendarSyncSettings(props: Props) {
  const { t } = useTranslation();
  const { api, view, error, loading, replace, refresh } =
    useCalendarSync(props);
  const [step, setStep] = useState<Step>({ kind: 'closed' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const inFlight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);

  async function run(action: () => Promise<CalendarSyncView | void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem('');
    setMessage('');
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
    (connection) => connection.status === 'ACTIVE',
  );

  async function chooseFrom(connectionId: string) {
    await run(async () => {
      const list = await api.listConnectionCalendars({
        spaceId: props.spaceId,
        connectionId,
      });
      setStep({ kind: 'choose', connectionId, calendars: list.calendars });
    });
  }

  return (
    <section
      className="settings-functional-panel calendar-sync"
      aria-labelledby="calendar-sync-title"
    >
      <h2 id="calendar-sync-title">
        {t('calendarSync.sharedHeading')}{' '}
        <ProMark label={t('calendarSync.pro')} />
      </h2>
      {message ? (
        <div className="calendar-sync-success" role="status">
          <strong>{t('calendarSync.connected.title')}</strong>
          <p>{message}</p>
        </div>
      ) : null}
      {problem && step.kind === 'closed' ? <p role="alert">{problem}</p> : null}

      {target ? (
        <TargetState
          {...props}
          api={api}
          view={view}
          busy={busy || offline}
          ifMatch={ifMatch}
          sponsorConnectionId={sponsorConnection?.id}
          confirmEnd={confirmEnd}
          setConfirmEnd={setConfirmEnd}
          run={run}
          onReconnect={() => setStep({ kind: 'credentials' })}
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
              onClick={() => void chooseFrom(connection.id)}
            >
              <span>
                <strong>
                  {t(`calendarSync.providers.${connection.provider}`)}
                </strong>
                <span>{connection.label}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          {view.providers.map((provider) => (
            <button
              key={provider}
              ref={provider === 'CALDAV' ? trigger : undefined}
              type="button"
              className="calendar-sync-choice"
              disabled={busy || offline}
              onClick={() => setStep({ kind: 'credentials' })}
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
              calendars: created.calendars,
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
        onClose={() => {
          if (!busy) {
            setStep({ kind: 'closed' });
            setProblem('');
          }
        }}
        onConfirm={(connectionId, calendarRef) =>
          run(async () => {
            const next = await api.setCalendarSyncTarget({
              spaceId: props.spaceId,
              ifMatch,
              spaceCalendarTargetSave: { connectionId, calendarRef },
            });
            setStep({ kind: 'closed' });
            setMessage(t('calendarSync.connected.body'));
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
    sponsorConnectionId: string | undefined;
    confirmEnd: boolean;
    setConfirmEnd: (value: boolean) => void;
    run: (action: () => Promise<CalendarSyncView | void>) => Promise<void>;
    onReconnect: () => void;
  },
) {
  const { t } = useTranslation();
  const { api, spaceId, view, busy, ifMatch, run } = props;
  const target = view.target!;
  const status = calendarSyncStatus(target);
  const provider = t(`calendarSync.providers.${target.provider}`);
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

  return (
    <div className="calendar-sync-target">
      <p className="calendar-sync-name">{target.calendarName}</p>
      <p className="field-help">
        {target.sponsoredByMe
          ? t('calendarSync.target.viaYou', { provider })
          : t('calendarSync.target.via', {
              provider,
              name: target.sponsor.displayName,
            })}
      </p>
      <p
        className={`calendar-sync-status calendar-sync-status-${status}`}
        role="status"
      >
        <span aria-hidden="true" className="calendar-sync-dot" />
        {t(`calendarSync.status.${status}`)}
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
        <p>{t('calendarSync.target.synced', { count: target.syncedCount })}</p>
      ) : null}
      {target.keptCount > 0 ? (
        <p className="field-help">
          {t('calendarSync.target.kept', { count: target.keptCount })}
        </p>
      ) : null}
      {lastSuccess ? (
        <p className="field-help">
          {t('calendarSync.target.lastSuccess', { time: lastSuccess })}
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

      {status === 'paused' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => api.resumeCalendarSyncTarget({ spaceId, ifMatch }))
          }
        >
          {t('calendarSync.actions.resume')}
        </button>
      ) : status === 'broken' && target.sponsoredByMe ? (
        <button type="button" disabled={busy} onClick={props.onReconnect}>
          {t('calendarSync.actions.reconnect')}
        </button>
      ) : status !== 'broken' && view.canSync ? (
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void run(() => api.requestCalendarSync({ spaceId }))}
        >
          {t('calendarSync.actions.syncNow')}
        </button>
      ) : status === 'proPaused' ? (
        <Link to={proPaywallPath('calendar')}>
          {t('proPaywall.contextAction')}
        </Link>
      ) : null}

      <div className="calendar-sync-row">
        {target.status === 'ACTIVE' ? (
          <button
            type="button"
            className="tertiary"
            disabled={busy}
            onClick={() =>
              void run(() => api.pauseCalendarSyncTarget({ spaceId, ifMatch }))
            }
          >
            {t('calendarSync.actions.pause')}
          </button>
        ) : null}
        {!props.confirmEnd ? (
          <button
            type="button"
            className="tertiary"
            disabled={busy}
            onClick={() => props.setConfirmEnd(true)}
          >
            {t('calendarSync.actions.end')}
          </button>
        ) : null}
      </div>
      {props.confirmEnd ? (
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
                  props.setConfirmEnd(false);
                  return next;
                })
              }
            >
              {t('calendarSync.actions.endConfirmAction')}
            </button>
            <button
              type="button"
              className="tertiary"
              onClick={() => props.setConfirmEnd(false)}
            >
              {t('calendarSync.actions.keepSyncing')}
            </button>
          </div>
        </section>
      ) : null}
      {props.sponsorConnectionId ? (
        <div className="calendar-sync-private">
          <button
            type="button"
            className="tertiary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.removeCalendarConnection({
                  spaceId,
                  connectionId: props.sponsorConnectionId!,
                });
                return api.getCalendarSync({ spaceId });
              })
            }
          >
            {t('calendarSync.actions.disconnect')}
          </button>
          <p className="field-help">
            {t('calendarSync.actions.disconnectHint')}
          </p>
        </div>
      ) : null}
    </div>
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
  step: { connectionId: string; calendars: CalendarOption[] } | null;
  busy: boolean;
  problem: string;
  restoreFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
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
      }
    >
      <fieldset className="calendar-sync-calendars">
        <legend className="sr-only">{t('calendarSync.choose.title')}</legend>
        {step?.calendars.map((calendar) => (
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
              {calendar.name}
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
      {props.problem ? (
        <p role="alert" className="field-error">
          {props.problem}
        </p>
      ) : null}
    </ShortTaskSheet>
  );
}
