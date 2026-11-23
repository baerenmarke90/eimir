import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiRuntime } from '../client/apiRuntimeContext';
import {
  type FailureReference,
  lastFailureReference,
} from '../client/failureReference';
import { clientProblemKind } from '../client/problemDetails';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import { useSupportReportsAvailable } from '../client/supportReportsAvailability';
import { useTranslation } from '../i18n';
import { SupportReportSheet } from './SupportReportSheet';
import { UiState, type UiStateKind } from './UiState';

const KIND_TO_STATE: Record<
  ReturnType<typeof clientProblemKind>,
  UiStateKind
> = {
  validation: 'error',
  unauthorized: 'permission',
  permission: 'permission',
  notFound: 'permission',
  conflict: 'conflict',
  rateLimit: 'rateLimit',
  offline: 'offline',
  server: 'error',
  unknown: 'error',
};

const COPY_KEYS = {
  validation: ['states.validation.title', 'states.validation.body'],
  unauthorized: ['states.session.title', 'states.session.body'],
  permission: ['states.permission.title', 'states.permission.body'],
  notFound: ['states.permission.title', 'states.permission.body'],
  conflict: ['states.conflict.title', 'states.conflict.body'],
  rateLimit: ['states.rateLimit.title', 'states.rateLimit.body'],
  offline: ['states.offline.title', 'states.offline.body'],
  server: ['states.server.title', 'states.server.body'],
  unknown: ['states.unknown.title', 'states.unknown.body'],
} as const;

/**
 * Failures a support report can help with (#2189). A lost session, missing
 * access, an unreachable instance or a rate limit are not reported: the
 * report could not be sent or would not tell the team anything new.
 */
const REPORTABLE_KINDS: ReadonlySet<ReturnType<typeof clientProblemKind>> =
  new Set(['server', 'unknown', 'validation', 'conflict']);

/**
 * The quiet "Report a problem" action. It exists only below a signed-in
 * session (and so below the app's query client) and only when the instance
 * accepts reports. The failure shown here is captured when the sheet opens.
 */
function ReportProblemAction({ retry }: { retry?: ReactNode }) {
  const { t } = useTranslation();
  const available = useSupportReportsAvailable();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<FailureReference | undefined>();
  if (!available) return retry ?? null;
  return (
    <div className="problem-state-actions">
      {retry}
      <button
        type="button"
        className="tertiary"
        onClick={() => {
          setFailure(lastFailureReference());
          setOpen(true);
        }}
      >
        {t('supportReport.action')}
      </button>
      <SupportReportSheet
        open={open}
        onClose={() => setOpen(false)}
        initialKind="PROBLEM"
        failure={failure}
      />
    </div>
  );
}

export function ProblemState({
  error,
  onRetry,
  detail,
  reportable = true,
}: {
  error: unknown;
  onRetry?: () => void;
  /** An already localized, more specific reason replacing the generic body. */
  detail?: string;
  /** False keeps the "Report a problem" action away from this screen. */
  reportable?: boolean;
}) {
  const { t } = useTranslation();
  const signedIn = Boolean(useApiRuntime()?.accountId);
  const kind = clientProblemKind(error);
  const [titleKey, bodyKey] = COPY_KEYS[kind];

  const primaryAction =
    kind === 'unauthorized' ? (
      <Link
        className="button-link secondary-link"
        to={PUBLIC_START_ROUTE}
        reloadDocument
      >
        {t('common.backToStart')}
      </Link>
    ) : onRetry && kind !== 'permission' ? (
      <button type="button" className="secondary" onClick={onRetry}>
        {t('common.retry')}
      </button>
    ) : undefined;
  const action =
    reportable && signedIn && REPORTABLE_KINDS.has(kind) ? (
      <ReportProblemAction retry={primaryAction} />
    ) : (
      primaryAction
    );

  return (
    <UiState
      kind={KIND_TO_STATE[kind]}
      title={t(titleKey)}
      body={detail || t(bodyKey)}
      action={action}
    />
  );
}
