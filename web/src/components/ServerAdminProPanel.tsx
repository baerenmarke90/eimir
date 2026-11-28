import { type FormEvent, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ServerAdminProApi } from '../api/generated/apis/ServerAdminProApi';
import type { ProOverviewView } from '../api/generated/models/ProOverviewView';
import {
  endOfLocalDay,
  GIFT_CODE_NOTE_MAX,
  parseGiftCodeCount,
  redeemableUntilBounds,
  sortRunningGifts,
  useCreateGiftCodeBatch,
  useProOverview,
} from '../client/serverAdminPro';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { EimirIcon } from './EimirIcon';
import { NativeDateInput } from './NativeDateField';
import {
  batchIsExpired,
  ServerAdminGiftCodeBatchSheet,
} from './ServerAdminGiftCodeBatchSheet';
import { GIFT_MONTHS } from './ServerAdminPremiumGiftSheet';
import { shortSpaceId } from './ServerAdminSpaceFile';
import { sectionHref } from './serverAdminAreas';
import { UiState } from './UiState';
import './ServerAdminProPanel.css';

const DEFAULT_MONTHS = 3;
const DEFAULT_COUNT = '10';

/** The host couples redeem on, from the overview's public base URL. */
export function redeemHost(publicBaseUrl: string | undefined): string | null {
  if (!publicBaseUrl) return null;
  try {
    return new URL(publicBaseUrl).host || null;
  } catch {
    return null;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(resolvedLocale()).format(value);
}

function formatDay(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  }).format(value);
}

function Figures({ overview }: { overview: ProOverviewView }) {
  const { t } = useTranslation();
  return (
    <dl className="server-admin-pro-figures">
      <div className="server-admin-pro-figure">
        <dt>{t('serverAdmin.pro.figures.spaces')}</dt>
        <dd>{formatNumber(overview.spacesTotal)}</dd>
      </div>
      <div className="server-admin-pro-figure is-premium">
        <dt>{t('serverAdmin.pro.figures.premium')}</dt>
        <dd>{formatNumber(overview.spacesPremium)}</dd>
        <dd className="server-admin-pro-figure-detail">
          {t('serverAdmin.pro.figures.premiumSplit', {
            play: overview.premiumByPlay,
            gift: overview.premiumByGift,
          })}
        </dd>
      </div>
      <div className="server-admin-pro-figure">
        <dt>{t('serverAdmin.pro.figures.cancellations')}</dt>
        <dd>{formatNumber(overview.cancellations30d)}</dd>
      </div>
    </dl>
  );
}

function PlayCard({ overview }: { overview: ProOverviewView }) {
  const { t } = useTranslation();
  const { play } = overview;
  const chips = [
    { key: 'active', tone: 'positive', value: play.active },
    { key: 'paymentProblem', tone: 'warning', value: play.paymentProblem },
    { key: 'cancelledRunning', tone: 'quiet', value: play.cancelledRunning },
    { key: 'ended30d', tone: 'quiet', value: play.ended30d },
  ] as const;
  const empty =
    overview.premiumByPlay === 0 && chips.every((chip) => chip.value === 0);

  return (
    <section
      className="server-admin-panel server-admin-pro-card"
      aria-labelledby="server-admin-pro-play-title"
    >
      <h3 id="server-admin-pro-play-title">
        {t('serverAdmin.pro.play.title')}
      </h3>
      {empty ? (
        <p className="server-admin-muted">{t('serverAdmin.pro.play.empty')}</p>
      ) : (
        <ul
          className="server-admin-pro-chips"
          aria-labelledby="server-admin-pro-play-title"
        >
          {chips.map((chip) => (
            <li
              key={chip.key}
              className={`is-${chip.value === 0 ? 'quiet' : chip.tone}`}
            >
              <strong>{formatNumber(chip.value)}</strong>{' '}
              {t(`serverAdmin.pro.play.${chip.key}`)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GiftCodesCard({
  api,
  overview,
  host,
  onOpenBatch,
}: {
  api: ServerAdminProApi;
  overview: ProOverviewView;
  host: string | null;
  onOpenBatch: (batchId: string) => void;
}) {
  const { t } = useTranslation();
  const countRef = useRef<HTMLInputElement>(null);
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [note, setNote] = useState('');
  const [until, setUntil] = useState('');
  const [attempted, setAttempted] = useState(false);
  const create = useCreateGiftCodeBatch(api);
  const parsedCount = parseGiftCodeCount(count);
  const countInvalid = attempted && parsedCount === null;
  const untilBounds = redeemableUntilBounds();
  const handedOut = overview.batches.reduce(
    (sum, batch) => sum + batch.handedOut,
    0,
  );
  const redeemed = overview.batches.reduce(
    (sum, batch) => sum + batch.redeemed,
    0,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (parsedCount === null) {
      countRef.current?.focus();
      return;
    }
    if (create.isPending) return;
    const trimmedNote = note.trim();
    // An empty date leaves the server default of 12 months.
    const redeemableUntil = endOfLocalDay(until);
    create.mutate(
      {
        durationMonths: months,
        count: parsedCount,
        ...(redeemableUntil ? { redeemableUntil } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      },
      {
        onSuccess: (batch) => {
          setNote('');
          setAttempted(false);
          onOpenBatch(batch.id);
        },
      },
    );
  }

  return (
    <section
      className="server-admin-panel server-admin-pro-card"
      aria-labelledby="server-admin-pro-codes-title"
    >
      <div className="server-admin-pro-card-head">
        <span className="server-admin-pro-card-icon">
          <EimirIcon name="geschenk" />
        </span>
        <div>
          <h3 id="server-admin-pro-codes-title">
            {t('serverAdmin.pro.codes.title')}
          </h3>
          <p className="server-admin-muted">
            {t('serverAdmin.pro.codes.body')}
          </p>
        </div>
      </div>

      <form className="server-admin-pro-form" noValidate onSubmit={submit}>
        <div className="server-admin-pro-form-pair">
          <div className="server-admin-pro-field">
            <label htmlFor="server-admin-pro-duration">
              {t('serverAdmin.pro.codes.duration')}
            </label>
            <select
              id="server-admin-pro-duration"
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
            >
              {GIFT_MONTHS.map((value) => (
                <option key={value} value={value}>
                  {t('serverAdmin.giftSheet.months', { count: value })}
                </option>
              ))}
            </select>
          </div>
          <div className="server-admin-pro-field">
            <label htmlFor="server-admin-pro-count">
              {t('serverAdmin.pro.codes.count')}
            </label>
            <input
              ref={countRef}
              id="server-admin-pro-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              value={count}
              aria-invalid={countInvalid || undefined}
              aria-describedby={
                countInvalid ? 'server-admin-pro-count-error' : undefined
              }
              onChange={(event) => setCount(event.target.value)}
            />
          </div>
        </div>
        {countInvalid ? (
          <p id="server-admin-pro-count-error" className="status status-error">
            {t('serverAdmin.pro.codes.countInvalid')}
          </p>
        ) : null}
        <div className="server-admin-pro-field">
          <label htmlFor="server-admin-pro-until">
            {t('serverAdmin.pro.codes.redeemableUntil')}
          </label>
          <NativeDateInput
            id="server-admin-pro-until"
            value={until}
            min={untilBounds.min}
            max={untilBounds.max}
            aria-describedby="server-admin-pro-until-hint"
            onChange={(event) => setUntil(event.target.value)}
          />
          <span id="server-admin-pro-until-hint" className="server-admin-muted">
            {t('serverAdmin.pro.codes.redeemableUntilHint')}
          </span>
        </div>
        <div className="server-admin-pro-field">
          <label htmlFor="server-admin-pro-note">
            {t('serverAdmin.pro.codes.note')}
          </label>
          <input
            id="server-admin-pro-note"
            type="text"
            maxLength={GIFT_CODE_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {create.isError ? (
          <p className="status status-error" role="alert">
            {t('serverAdmin.pro.codes.createFailed')}
          </p>
        ) : null}
        <AddActionButton
          type="submit"
          className="server-admin-pro-create"
          label={t('serverAdmin.pro.codes.create')}
          pendingLabel={t('serverAdmin.pro.codes.creating')}
          pending={create.isPending}
        />
      </form>

      <p className="server-admin-muted">
        {t('serverAdmin.pro.codes.totals', { handedOut, redeemed })}
        {host ? ` · ${t('serverAdmin.pro.codes.redeemAt', { host })}` : null}
      </p>

      <h4 id="server-admin-pro-batches-title">
        {t('serverAdmin.pro.codes.batchesTitle')}
      </h4>
      {overview.batches.length === 0 ? (
        <p className="server-admin-muted">{t('serverAdmin.pro.codes.empty')}</p>
      ) : (
        <ul
          className="server-admin-pro-rows"
          aria-labelledby="server-admin-pro-batches-title"
        >
          {overview.batches.map((batch) => {
            const state =
              batch.revokedAt !== null
                ? 'revoked'
                : batchIsExpired(batch)
                  ? 'expired'
                  : null;
            return (
              <li key={batch.id}>
                <button
                  type="button"
                  className="server-admin-pro-row"
                  onClick={() => onOpenBatch(batch.id)}
                >
                  <span className="server-admin-pro-row-text">
                    <strong>
                      {t('serverAdmin.pro.codes.batchTitle', {
                        count: batch.total,
                        duration: t('serverAdmin.giftSheet.months', {
                          count: batch.durationMonths,
                        }),
                      })}
                    </strong>
                    {batch.note ? <span>{batch.note}</span> : null}
                    <span className="server-admin-muted">
                      {t('serverAdmin.pro.codes.batchCounts', {
                        open: batch.open,
                        handedOut: batch.handedOut,
                        redeemed: batch.redeemed,
                      })}
                    </span>
                  </span>
                  {state ? (
                    <span className="server-admin-pro-state">
                      {t(`serverAdmin.pro.codes.${state}`)}
                    </span>
                  ) : null}
                  <EimirIcon name="chevron-right" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RunningGiftsCard({ overview }: { overview: ProOverviewView }) {
  const { t } = useTranslation();
  const gifts = sortRunningGifts(overview.runningGifts);
  return (
    <section
      className="server-admin-panel server-admin-pro-card"
      aria-labelledby="server-admin-pro-gifts-title"
    >
      <h3 id="server-admin-pro-gifts-title">
        {t('serverAdmin.pro.gifts.title')}
      </h3>
      {gifts.length === 0 ? (
        <p className="server-admin-muted">{t('serverAdmin.pro.gifts.empty')}</p>
      ) : (
        <ul
          className="server-admin-pro-rows"
          aria-labelledby="server-admin-pro-gifts-title"
        >
          {gifts.map((gift) => (
            <li key={gift.spaceId}>
              <Link
                className="server-admin-pro-row"
                to={sectionHref('spaces', { space: gift.spaceId })}
              >
                <span className="server-admin-pro-row-text">
                  <strong className="server-admin-pro-space-id">
                    {shortSpaceId(gift.spaceId)}
                  </strong>
                  <span className="server-admin-muted">
                    {gift.origin === 'code'
                      ? gift.batchNote
                        ? t('serverAdmin.pro.gifts.fromCodeNote', {
                            note: gift.batchNote,
                          })
                        : t('serverAdmin.pro.gifts.fromCode')
                      : t('serverAdmin.pro.gifts.manual')}
                  </span>
                </span>
                <span className="server-admin-pro-row-end">
                  {gift.effectiveUntil
                    ? t('serverAdmin.pro.gifts.until', {
                        date: formatDay(gift.effectiveUntil),
                      })
                    : t('serverAdmin.pro.gifts.noEnd')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {overview.runningGiftsTotal > gifts.length ? (
        <p className="server-admin-muted">
          {t('serverAdmin.pro.gifts.more', {
            shown: gifts.length,
            total: overview.runningGiftsTotal,
          })}
        </p>
      ) : null}
    </section>
  );
}

/**
 * ServerAdmin › Pro (part 5, eimir. Cloud only): Premium figures, Google Play
 * states, gift code batches and running gifts. Compact stacks the blocks;
 * Expanded places them in the ServerAdmin grid's two columns.
 */
export function ServerAdminProPanel({
  api,
  publicBaseUrl,
}: {
  api: ServerAdminProApi;
  /** The overview's `publicBaseUrl`: where couples redeem their codes. */
  publicBaseUrl?: string;
}) {
  const { t } = useTranslation();
  const query = useProOverview(api);
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const overview = query.data;

  if (query.isPending || query.error || !overview) {
    return (
      <section className="server-admin-panel server-admin-panel-wide">
        {query.isPending ? (
          <UiState
            kind="loading"
            title={t('serverAdmin.states.loadingTitle')}
            body={t('serverAdmin.states.loadingBody')}
          />
        ) : (
          <UiState
            kind="error"
            title={t('serverAdmin.states.errorTitle')}
            body={t('serverAdmin.states.errorBody')}
            action={
              <button type="button" onClick={() => void query.refetch()}>
                {t('common.refresh')}
              </button>
            }
          />
        )}
      </section>
    );
  }

  return (
    <>
      <header className="server-admin-panel-wide server-admin-pro-heading">
        <p className="eyebrow">{t('serverAdmin.pro.eyebrow')}</p>
        <h2>{t('serverAdmin.pro.title')}</h2>
      </header>
      <div className="server-admin-pro-column">
        <Figures overview={overview} />
        <PlayCard overview={overview} />
      </div>
      <div className="server-admin-pro-column">
        <GiftCodesCard
          api={api}
          overview={overview}
          host={redeemHost(publicBaseUrl)}
          onOpenBatch={setOpenBatchId}
        />
        <RunningGiftsCard overview={overview} />
      </div>
      {openBatchId ? (
        <ServerAdminGiftCodeBatchSheet
          api={api}
          batchId={openBatchId}
          onClose={() => setOpenBatchId(null)}
        />
      ) : null}
    </>
  );
}
