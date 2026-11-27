import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReplyTemplateView } from '../api/generated/models/SupportReplyTemplateView';
import { assertOnlineWrite } from './connectivity';
import { ClientProblemError } from './problemDetails';
import {
  normalizeSupportReportError,
  supportReportErrorKey,
} from './supportReportsAdmin';

/** Operator reply templates of the ServerAdmin Help area (#2327). */

/** The name is the chip label; the limits match the server. */
export const REPLY_TEMPLATE_NAME_MAX = 40;
/** A template never exceeds what one reply may hold. */
export const REPLY_TEMPLATE_TEXT_MAX = 500;
export const REPLY_TEMPLATE_LIMIT = 30;

export const REPLY_TEMPLATES_QUERY_KEY = [
  'server-admin',
  'support-reports',
  'templates',
] as const;

export interface ReplyTemplateDraft {
  name: string;
  text: string;
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw await normalizeSupportReportError(error);
  }
}

async function write<T>(operation: () => Promise<T>): Promise<T> {
  assertOnlineWrite();
  return call(operation);
}

export async function loadReplyTemplates(
  api: ServerAdminSupportReportsApi,
): Promise<SupportReplyTemplateView[]> {
  const view = await call(() => api.listSupportReplyTemplates());
  return view.items;
}

export function createReplyTemplate(
  api: ServerAdminSupportReportsApi,
  draft: ReplyTemplateDraft,
): Promise<SupportReplyTemplateView> {
  return write(() =>
    api.createSupportReplyTemplate({ supportReplyTemplateWrite: draft }),
  );
}

export function updateReplyTemplate(
  api: ServerAdminSupportReportsApi,
  templateId: string,
  draft: ReplyTemplateDraft,
): Promise<SupportReplyTemplateView> {
  return write(() =>
    api.updateSupportReplyTemplate({
      templateId,
      supportReplyTemplateWrite: draft,
    }),
  );
}

export function deleteReplyTemplate(
  api: ServerAdminSupportReportsApi,
  templateId: string,
): Promise<void> {
  return write(() => api.deleteSupportReplyTemplate({ templateId }));
}

/**
 * The reply after inserting a template, and where the caret goes.
 *
 * The text goes to the caret or replaces the selection. Without a caret it
 * fills an empty reply or follows existing text on a new line. Nothing typed is
 * ever overwritten unselected, and nothing is cut: a result over the reply limit
 * shows the too-long state instead. Positions are UTF-16 offsets, as the
 * textarea reports them.
 */
export function insertTemplate(
  value: string,
  selection: { start: number; end: number } | null,
  text: string,
): { value: string; caret: number } {
  if (selection === null) {
    if (value === '') return { value: text, caret: text.length };
    const next = `${value}\n${text}`;
    return { value: next, caret: next.length };
  }
  const start = Math.min(Math.max(selection.start, 0), value.length);
  const end = Math.min(Math.max(selection.end, start), value.length);
  return {
    value: value.slice(0, start) + text + value.slice(end),
    caret: start + text.length,
  };
}

/** The localization key of the message shown for a failed template request. */
export function replyTemplateErrorKey(error: unknown): string {
  if (error instanceof ClientProblemError) {
    switch (error.code) {
      case 'SUPPORT_TEMPLATE_LIMIT':
        return 'serverAdmin.templates.errors.limit';
      case 'SUPPORT_TEMPLATE_NAME_TAKEN':
        return 'serverAdmin.templates.errors.nameTaken';
      case 'SUPPORT_TEMPLATE_NOT_FOUND':
        return 'serverAdmin.templates.errors.notFound';
      default:
        break;
    }
  }
  return supportReportErrorKey(error);
}
