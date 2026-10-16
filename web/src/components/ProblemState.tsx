import { Link } from 'react-router-dom';
import { clientProblemKind } from '../client/problemDetails';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import { useTranslation } from '../i18n';
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

export function ProblemState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const kind = clientProblemKind(error);
  const [titleKey, bodyKey] = COPY_KEYS[kind];

  const action =
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

  return (
    <UiState
      kind={KIND_TO_STATE[kind]}
      title={t(titleKey)}
      body={t(bodyKey)}
      action={action}
    />
  );
}
