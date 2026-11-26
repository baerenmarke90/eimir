import { type ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReplyTemplateView } from '../api/generated/models/SupportReplyTemplateView';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import {
  createReplyTemplate,
  deleteReplyTemplate,
  loadReplyTemplates,
  REPLY_TEMPLATE_LIMIT,
  REPLY_TEMPLATES_QUERY_KEY,
  type ReplyTemplateDraft,
  replyTemplateErrorKey,
  updateReplyTemplate,
} from '../client/supportReplyTemplates';
import { useClientOnline } from '../client/supportReportsAdmin';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { ServerAdminReplyTemplateSheet } from './ServerAdminReplyTemplateSheet';
import { UiState } from './UiState';
import './ServerAdminSupportReportsPanel.css';

type SheetState =
  | { mode: 'create' }
  | { mode: 'edit'; template: SupportReplyTemplateView };

interface Feedback {
  tone: 'success' | 'error';
  message: string;
}

/** The template is gone (deleted elsewhere meanwhile). */
function isTemplateGone(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.code === 'SUPPORT_TEMPLATE_NOT_FOUND'
  );
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0] ?? '';
}

/**
 * Help > Reply templates (#2327): the operator's saved replies, shared by all
 * ServerAdmins. Create, edit and delete happen in a sheet; the list stays put.
 */
export function ServerAdminReplyTemplatesPanel({
  api,
}: {
  api: ServerAdminSupportReportsApi;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const online = useClientOnline();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const query = useQuery({
    queryKey: REPLY_TEMPLATES_QUERY_KEY,
    queryFn: () => loadReplyTemplates(api),
    retry: false,
    networkMode: 'always',
  });
  const templates = query.data ?? [];
  const atLimit = templates.length >= REPLY_TEMPLATE_LIMIT;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: REPLY_TEMPLATES_QUERY_KEY });
  }

  function failed(error: unknown) {
    if (isTemplateGone(error)) {
      setSheet(null);
      setFeedback({ tone: 'error', message: t('serverAdmin.templates.gone') });
      refresh();
      return;
    }
    setSheetError(
      t(replyTemplateErrorKey(error), { max: REPLY_TEMPLATE_LIMIT }),
    );
  }

  const saveMutation = useMutation({
    networkMode: 'always',
    mutationFn: (draft: ReplyTemplateDraft) =>
      sheet?.mode === 'edit'
        ? updateReplyTemplate(api, sheet.template.id, draft)
        : createReplyTemplate(api, draft),
    onMutate: () => {
      setSheetError(null);
      setFeedback(null);
    },
    onSuccess: () => {
      setSheet(null);
      setFeedback({
        tone: 'success',
        message: t('serverAdmin.templates.saved'),
      });
      refresh();
    },
    onError: failed,
  });

  const deleteMutation = useMutation({
    networkMode: 'always',
    mutationFn: (templateId: string) => deleteReplyTemplate(api, templateId),
    onMutate: () => {
      setSheetError(null);
      setFeedback(null);
    },
    onSuccess: () => {
      setSheet(null);
      setFeedback({
        tone: 'success',
        message: t('serverAdmin.templates.deleted'),
      });
      refresh();
    },
    onError: failed,
  });

  function openSheet(next: SheetState) {
    setSheetError(null);
    setFeedback(null);
    setSheet(next);
  }

  function confirmDelete(template: SupportReplyTemplateView) {
    if (
      window.confirm(
        t('serverAdmin.templates.sheet.deleteConfirm', { name: template.name }),
      )
    ) {
      deleteMutation.mutate(template.id);
    }
  }

  let content: ReactNode;
  if (query.isPending) {
    content = (
      <UiState
        kind="loading"
        compact
        title={t('serverAdmin.templates.loadingTitle')}
        body={t('serverAdmin.templates.loadingBody')}
      />
    );
  } else if (query.error) {
    const offline = clientProblemKind(query.error) === 'offline';
    content = (
      <UiState
        kind={offline ? 'offline' : 'error'}
        compact
        title={t(
          offline
            ? 'serverAdmin.reports.offlineTitle'
            : 'serverAdmin.templates.errorTitle',
        )}
        body={t(
          offline
            ? 'serverAdmin.reports.offlineBody'
            : 'serverAdmin.templates.errorBody',
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
  } else if (templates.length === 0) {
    content = (
      <UiState
        kind="empty"
        compact
        title={t('serverAdmin.templates.emptyTitle')}
        body={t('serverAdmin.templates.emptyBody')}
      />
    );
  } else {
    content = (
      <ul
        className="server-admin-template-list"
        aria-label={t('serverAdmin.templates.listLabel')}
      >
        {templates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              className="server-admin-template-row"
              onClick={() => openSheet({ mode: 'edit', template })}
            >
              <strong>{template.name}</strong>
              <span className="server-admin-template-row-text">
                {firstLine(template.text)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      className="server-admin-panel server-admin-panel-wide server-admin-templates"
      aria-labelledby="server-templates-title"
    >
      <div className="server-admin-section-heading">
        <div>
          <h2 id="server-templates-title">
            {t('serverAdmin.templates.title')}
          </h2>
          <p className="server-admin-muted">
            {t('serverAdmin.templates.body')}
          </p>
        </div>
      </div>

      {!online ? (
        <p className="status status-warning" role="status">
          {t('serverAdmin.templates.offlineNotice')}
        </p>
      ) : null}
      {feedback ? (
        <p
          className={`status ${feedback.tone === 'error' ? 'status-error' : 'status-success'}`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}

      {query.isSuccess ? (
        atLimit ? (
          <p className="server-admin-muted">
            {t('serverAdmin.templates.limitHint', {
              max: REPLY_TEMPLATE_LIMIT,
            })}
          </p>
        ) : (
          <div className="server-admin-template-create">
            <AddActionButton
              label={t('serverAdmin.templates.create')}
              disabled={!online}
              onClick={() => openSheet({ mode: 'create' })}
            />
          </div>
        )
      ) : null}

      {content}

      {sheet ? (
        <ServerAdminReplyTemplateSheet
          key={sheet.mode === 'edit' ? sheet.template.id : 'create'}
          template={sheet.mode === 'edit' ? sheet.template : null}
          pending={saveMutation.isPending}
          deleting={deleteMutation.isPending}
          online={online}
          error={sheetError}
          onSave={(draft) => saveMutation.mutate(draft)}
          onDelete={() => {
            if (sheet.mode === 'edit') confirmDelete(sheet.template);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </section>
  );
}
