// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import type { SupportReportReplyView } from '../api/generated/models/SupportReportReplyView';
import { ResponseError } from '../api/generated/runtime';
import { getNotificationItemTitle } from '../client/notificationTitle';
import { i18n } from '../i18n';
import supportReport from '../i18n/locales/supportReport';
import { SupportReplyNotice } from './SupportReplyNotice';

function renderNotice(
  getSupportReportReply: () => Promise<SupportReportReplyView>,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const api = { getSupportReportReply: vi.fn(getSupportReportReply) };
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <SupportReplyNotice reportId="report-1" api={api} />
    </QueryClientProvider>,
  );
  return { ...rendered, api };
}

afterEach(() => cleanup());

describe('SupportReplyNotice', () => {
  it('reply_notification_renders_html_as_text', async () => {
    const markup = '<img src=x onerror=alert(1)>';
    const { container, api } = renderNotice(async () => ({
      text: markup,
      repliedAt: new Date('2026-11-23T10:00:00Z'),
    }));
    expect(screen.getByText(supportReport.reply.context)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(markup)).toBeTruthy());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(api.getSupportReportReply).toHaveBeenCalledWith({
      reportId: 'report-1',
    });
  });

  it('shows no reply text when the reply is gone', async () => {
    const { container, api } = renderNotice(() =>
      Promise.reject(new ResponseError(new Response(null, { status: 404 }))),
    );
    await waitFor(() =>
      expect(api.getSupportReportReply).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(container.querySelector('.support-reply-text')).toBeNull(),
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('names the notice neutrally', () => {
    const item = {
      id: 'n1',
      kind: 'SUPPORT_REPLY',
      targetType: 'SUPPORT_REPORT',
      targetId: 'report-1',
      actorId: null,
      readAt: null,
      createdAt: new Date(),
      sourceEventId: 'e1',
    } as NotificationItem;
    expect(getNotificationItemTitle(item, i18n.t.bind(i18n))).toBe(
      supportReport.reply.title,
    );
  });
});
