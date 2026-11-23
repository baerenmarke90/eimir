import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { SupportApi } from '../api/generated/apis/SupportApi';
import type { SupportReportReplyView } from '../api/generated/models/SupportReportReplyView';
import { ResponseError } from '../api/generated/runtime';
import { Configuration } from '../client/apiConfiguration';
import { useApiRuntime } from '../client/apiRuntimeContext';
import { useTranslation } from '../i18n';
import './SupportReplyNotice.css';

/** What the notice needs from the generated client; replaceable in tests. */
export interface SupportReplyReader {
  getSupportReportReply(request: {
    reportId: string;
  }): Promise<SupportReportReplyView>;
}

export function supportReplyQueryKey(reportId: string) {
  return ['support-report-reply', reportId] as const;
}

/**
 * The body of a `SUPPORT_REPLY` notice (#2189): a neutral context line and the
 * operator's reply, read on demand from the reporter-only endpoint. The reply
 * is rendered as a React text node only: never as markup and never linkified.
 * A missing reply (404) or a failed read shows the context line alone.
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
    queryKey: supportReplyQueryKey(reportId),
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

  return (
    <div className="support-reply">
      <p className="support-reply-context">
        {t('supportReport.reply.context')}
      </p>
      {reply.isPending && reader ? (
        <span className="support-reply-skeleton" aria-busy="true" role="status">
          <span className="sr-only">{t('supportReport.reply.loading')}</span>
        </span>
      ) : reply.data ? (
        <p className="support-reply-text">{reply.data.text}</p>
      ) : null}
    </div>
  );
}
