import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReportListItem } from '../api/generated/models/SupportReportListItem';
import { clientProblemKind } from '../client/problemDetails';
import {
  formatReportDate,
  formatReportDay,
  loadSupportReportPage,
  nextSupportReportCursor,
  resolveSupportReportFilter,
  SUPPORT_REPORT_FILTERS,
  type SupportReportFilter,
  supportReportsQueryKey,
} from '../client/supportReportsAdmin';
import { useTranslation } from '../i18n';
import { ServerAdminSupportReportDetail } from './ServerAdminSupportReportDetail';
import { UiState } from './UiState';
import './ServerAdminSupportReportsPanel.css';

function ReportRow({
  report,
  selected,
  onOpen,
  buttonRef,
}: {
  report: SupportReportListItem;
  selected: boolean;
  onOpen: () => void;
  buttonRef: (element: HTMLButtonElement | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        className="server-admin-report-row"
        aria-current={selected ? 'true' : undefined}
        onClick={onOpen}
      >
        <span className="server-admin-report-row-head">
          <span
            className={`server-admin-report-kind is-${report.kind.toLowerCase()}`}
          >
            {t(`serverAdmin.reports.kinds.${report.kind}`)}
          </span>
          <span className="server-admin-report-row-meta">
            <time
              dateTime={report.createdAt.toISOString()}
              title={formatReportDate(report.createdAt)}
            >
              {formatReportDay(report.createdAt)}
            </time>{' '}
            {t('serverAdmin.reports.item.meta', {
              platform: t(`serverAdmin.reports.platforms.${report.platform}`),
              os: report.os,
              version: report.appVersion,
              build: report.build,
            })}
          </span>
        </span>
        {report.notePreview ? (
          <q className="server-admin-report-preview">{report.notePreview}</q>
        ) : null}
        <span className="server-admin-report-row-state">
          {t(`serverAdmin.reports.states.${report.state}`)}
        </span>
        {report.hasReply || report.ticket || report.archivedAt ? (
          <span className="server-admin-report-row-flags">
            {report.archivedAt ? (
              <span>{t('serverAdmin.reports.item.archived')}</span>
            ) : null}
            {report.hasReply ? (
              <span>{t('serverAdmin.reports.item.replied')}</span>
            ) : null}
            {report.ticket ? (
              <span>{t('serverAdmin.reports.item.ticket')}</span>
            ) : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * The operator's triage queue of support reports (#2189, #2327): state filters
 * with their counts and a keyset-paged list of cards with a note preview. A report opens
 * in place; on Compact it replaces the list, on wide screens it sits beside it.
 */
export function ServerAdminSupportReportsPanel({
  api,
  initialFilter = null,
  onDraftChange,
  onEditTemplates,
}: {
  api: ServerAdminSupportReportsApi;
  /** The state query parameter of a deep link; defaults to new reports. */
  initialFilter?: string | null;
  /** Whether the open report holds an unsent reply or ticket text. */
  onDraftChange?: (dirty: boolean) => void;
  /** Opens the reply templates page from an open report. */
  onEditTemplates?: () => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<SupportReportFilter>(() =>
    resolveSupportReportFilter(initialFilter),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoreFocusId, setRestoreFocusId] = useState<string | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  // Why no report is open any more: it vanished, or the operator deleted it.
  const [closedNotice, setClosedNotice] = useState<'gone' | 'deleted' | null>(
    null,
  );
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const query = useInfiniteQuery({
    queryKey: supportReportsQueryKey(filter),
    queryFn: ({ pageParam }) => loadSupportReportPage(api, filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextSupportReportCursor,
    retry: false,
    // An offline read fails as offline instead of pausing as loading.
    networkMode: 'always',
  });

  // Closing a report returns focus to the row that opened it, or to the
  // section heading when that row left the current filter meanwhile.
  useEffect(() => {
    if (restoreFocusId === null || selectedId) return;
    const row = rowRefs.current.get(restoreFocusId);
    (row ?? headingRef.current)?.focus({ preventScroll: true });
    setRestoreFocusId(null);
  }, [restoreFocusId, selectedId]);

  function changeFilter(next: SupportReportFilter) {
    setClosedNotice(null);
    setFilter(next);
  }

  function changeDraft(dirty: boolean) {
    setDraftDirty(dirty);
    onDraftChange?.(dirty);
  }

  // From 80rem the list stays beside the report: opening another row would
  // replace the open report, so an unsent draft asks first, as Back does.
  function openReport(reportId: string) {
    if (reportId === selectedId) return;
    if (
      draftDirty &&
      !window.confirm(t('serverAdmin.reports.detail.discardDraftConfirm'))
    ) {
      return;
    }
    setClosedNotice(null);
    setSelectedId(reportId);
  }

  function closeDetail(reason?: 'gone' | 'deleted') {
    // A deleted report has no row to return to: focus goes to the heading.
    setRestoreFocusId(reason ? '' : selectedId);
    setClosedNotice(reason ?? null);
    setSelectedId(null);
  }

  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  // The counts do not depend on the filter: keep the last ones while another
  // filter loads, so the segments do not lose their numbers on every switch.
  const latestCounts = pages[0]?.stateCounts;
  const countsRef = useRef(latestCounts);
  if (latestCounts) countsRef.current = latestCounts;
  const stateCounts = countsRef.current;
  const counts: Partial<Record<SupportReportFilter, number>> = stateCounts
    ? {
        NEW: stateCounts._new,
        IN_PROGRESS: stateCounts.inProgress,
        CLOSED: stateCounts.closed,
      }
    : {};

  let listContent: ReactNode;
  if (query.isPending) {
    listContent = (
      <UiState
        kind="loading"
        compact
        title={t('serverAdmin.reports.loadingTitle')}
        body={t('serverAdmin.reports.loadingBody')}
      />
    );
  } else if (query.error && items.length === 0) {
    const offline = clientProblemKind(query.error) === 'offline';
    listContent = (
      <UiState
        kind={offline ? 'offline' : 'error'}
        compact
        title={t(
          offline
            ? 'serverAdmin.reports.offlineTitle'
            : 'serverAdmin.reports.errorTitle',
        )}
        body={t(
          offline
            ? 'serverAdmin.reports.offlineBody'
            : 'serverAdmin.reports.errorBody',
        )}
        action={
          <button
            type="button"
            className="secondary"
            onClick={() => void query.refetch()}
          >
            {t('serverAdmin.reports.retry')}
          </button>
        }
      />
    );
  } else if (items.length === 0) {
    listContent = (
      <UiState
        kind="empty"
        compact
        title={t('serverAdmin.reports.emptyTitle')}
        body={t(
          filter === 'NEW'
            ? 'serverAdmin.reports.emptyNewBody'
            : filter === 'all'
              ? 'serverAdmin.reports.emptyAllBody'
              : filter === 'archived'
                ? 'serverAdmin.reports.emptyArchivedBody'
                : 'serverAdmin.reports.emptyFilteredBody',
        )}
        action={
          filter === 'all' ? undefined : (
            <button
              type="button"
              className="secondary"
              onClick={() => changeFilter('all')}
            >
              {t('serverAdmin.reports.showAll')}
            </button>
          )
        }
      />
    );
  } else {
    listContent = (
      <>
        <ul
          className="server-admin-report-list"
          aria-label={t('serverAdmin.reports.listLabel')}
          aria-busy={query.isFetching || undefined}
        >
          {items.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              selected={report.id === selectedId}
              onOpen={() => openReport(report.id)}
              buttonRef={(element) => {
                if (element) rowRefs.current.set(report.id, element);
                else rowRefs.current.delete(report.id);
              }}
            />
          ))}
        </ul>
        {query.isFetchNextPageError ? (
          <p className="status status-error" role="alert">
            {t('serverAdmin.reports.loadMoreError')}
          </p>
        ) : null}
        {query.hasNextPage ? (
          <button
            type="button"
            className="secondary server-admin-report-more"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage
              ? t('serverAdmin.reports.loadingMore')
              : t('serverAdmin.reports.loadMore')}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <section
      className="server-admin-panel server-admin-panel-wide server-admin-reports"
      aria-labelledby="server-reports-title"
    >
      <div className="server-admin-section-heading">
        <div>
          <h2 id="server-reports-title" ref={headingRef} tabIndex={-1}>
            {t('serverAdmin.reports.title')}
          </h2>
          <p className="server-admin-muted">{t('serverAdmin.reports.body')}</p>
        </div>
      </div>

      <div
        className={`server-admin-reports-layout${selectedId ? ' has-selection' : ''}`}
      >
        <div className="server-admin-reports-browse">
          <fieldset className="server-admin-report-segments">
            <legend className="sr-only">
              {t('serverAdmin.reports.filter.label')}
            </legend>
            {SUPPORT_REPORT_FILTERS.map((value) => {
              const label = t(`serverAdmin.reports.filter.${value}`);
              const count = counts[value];
              return (
                <button
                  key={value}
                  type="button"
                  className="secondary"
                  aria-pressed={filter === value}
                  onClick={() => changeFilter(value)}
                >
                  {count === undefined
                    ? label
                    : t('serverAdmin.reports.filter.withCount', {
                        label,
                        count,
                      })}
                </button>
              );
            })}
          </fieldset>
          {closedNotice === 'gone' ? (
            <p className="status status-error" role="alert">
              {t('serverAdmin.reports.errors.notFound')}
            </p>
          ) : null}
          {closedNotice === 'deleted' ? (
            <p className="status status-success" role="status">
              {t('serverAdmin.reports.manage.deleted')}
            </p>
          ) : null}
          {listContent}
          <p className="server-admin-muted server-admin-report-anonymous">
            {t('serverAdmin.reports.anonymousFooter')}
          </p>
        </div>

        {selectedId ? (
          <ServerAdminSupportReportDetail
            key={selectedId}
            api={api}
            reportId={selectedId}
            onClose={closeDetail}
            onDraftChange={changeDraft}
            onEditTemplates={onEditTemplates}
          />
        ) : null}
      </div>
    </section>
  );
}
