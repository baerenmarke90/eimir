import { useQuery } from '@tanstack/react-query';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import {
  loadReplyTemplates,
  REPLY_TEMPLATES_QUERY_KEY,
} from '../client/supportReplyTemplates';
import { useTranslation } from '../i18n';

/**
 * The operator's reply templates as chips above the reply field (#2327). A tap
 * hands the template text to the reply; nothing here writes.
 */
export function ServerAdminReplyTemplateChips({
  api,
  disabled,
  onInsert,
  onEdit,
}: {
  api: ServerAdminSupportReportsApi;
  /** The reply cannot be written right now (offline, sending). */
  disabled: boolean;
  onInsert: (text: string) => void;
  /** Opens the templates page; absent where that page is not reachable. */
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: REPLY_TEMPLATES_QUERY_KEY,
    queryFn: () => loadReplyTemplates(api),
    retry: false,
    networkMode: 'always',
  });
  const templates = query.data ?? [];

  return (
    <div className="server-admin-template-chips">
      <div className="server-admin-template-chips-head">
        <p className="server-admin-report-label">
          {t('serverAdmin.templates.chipsTitle')}
        </p>
        {onEdit && templates.length > 0 ? (
          <button
            type="button"
            className="server-admin-template-edit"
            onClick={onEdit}
          >
            {t('serverAdmin.templates.edit')}
          </button>
        ) : null}
      </div>
      {query.isError ? (
        <p className="server-admin-muted">
          {t('serverAdmin.templates.loadError')}
        </p>
      ) : query.isPending ? null : templates.length === 0 ? (
        <p className="server-admin-muted">
          {t('serverAdmin.templates.emptyHint')}{' '}
          {onEdit ? (
            <button
              type="button"
              className="server-admin-template-edit"
              onClick={onEdit}
            >
              {t('serverAdmin.templates.emptyLink')}
            </button>
          ) : null}
        </p>
      ) : (
        <ul className="server-admin-template-chip-list">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="server-admin-template-chip"
                disabled={disabled}
                onClick={() => onInsert(template.text)}
              >
                {template.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
