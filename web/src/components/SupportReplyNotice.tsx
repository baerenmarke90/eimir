import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { SupportApi } from '../api/generated/apis/SupportApi';
import type { SupportReportReplyView } from '../api/generated/models/SupportReportReplyView';
import { ResponseError } from '../api/generated/runtime';
import { Configuration } from '../client/apiConfiguration';
import { useApiRuntime } from '../client/apiRuntimeContext';
import { resolvedLocale, useTranslation } from '../i18n';
import './SupportReplyNotice.css';

/** What the notice needs from the generated client; replaceable in tests. */
export interface SupportReplyReader {
  getSupportReportReply(request: {
    reportId: string;
  }): Promise<SupportReportReplyView>;
}

/** Keyed by account: a reply is private to its reporter and never shared with another account on the same device. */
export function supportReplyQueryKey(
  accountId: string | undefined,
  reportId: string,
) {
  return ['support-report-reply', accountId, reportId] as const;
}

/** The report's day as a short localized date, e.g. "23. Nov.". */
function formatReportDate(reportedAt: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    day: 'numeric',
    month: 'short',
  }).format(reportedAt);
}

/**
 * The body of a `SUPPORT_REPLY` notice (#2189): a neutral context line and the
 * operator's reply, read on demand from the reporter-only endpoint. The reply
 * is rendered as a React text node only: never as markup and never linkified.
 * The context line names the report by its date once the reply is read. A
 * missing reply (404) or a failed read shows the undated context line alone.
 */
export function SupportReplyNotice({
  reportId,
  api,
}: {
  reportId: string;
  /** Replaces the generated client; for tests. */
  api?: SupportReplyReader;
}) {
  const { t } = useTranslation();
  const runtime = useApiRuntime();
  const reader = useMemo<SupportReplyReader | undefined>(
    () =>
      api ??
      (runtime
        ? new SupportApi(
            new Configuration({
              basePath: runtime.apiBaseUrl,
              headers: { Authorization: `Bearer ${runtime.accessToken}` },
            }),
          )
        : undefined),
    [api, runtime],
  );
  const reply = useQuery({
    queryKey: supportReplyQueryKey(runtime?.accountId, reportId),
    queryFn: async () => {
      if (!reader) return null;
      try {
        return await reader.getSupportReportReply({ reportId });
      } catch (error) {
        if (error instanceof ResponseError && error.response.status === 404)
          return null;
        throw error;
      }
    },
    enabled: Boolean(reader),
    retry: false,
    // A reply is written once and never changes.
    staleTime: Number.POSITIVE_INFINITY,
  });

  const loading = reply.isPending && Boolean(reader);

  return (
    <div className="support-reply" aria-busy={loading || undefined}>
      <p className="support-reply-context">
        {reply.data
          ? t('supportReport.reply.contextDated', {
              date: formatReportDate(reply.data.reportedAt),
            })
          : t('supportReport.reply.context')}
      </p>
      {loading ? (
        // Quiet and not announced: several replies may load at once.
        <span className="support-reply-skeleton" aria-hidden="true" />
      ) : reply.data ? (
        <p className="support-reply-text">{reply.data.text}</p>
      ) : null}
    </div>
  );
}
