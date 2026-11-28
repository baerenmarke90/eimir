// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReplyTemplateView } from '../api/generated/models/SupportReplyTemplateView';
import { ResponseError } from '../api/generated/runtime';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminReplyTemplatesPanel } from './ServerAdminReplyTemplatesPanel';
import germanUi from '../i18n/locales/de';

const templates = serverAdmin.templates;
const sheet = templates.sheet;

function template(
  index: number,
  name = `Template ${index}`,
  text = `Text ${index}\nsecond line`,
): SupportReplyTemplateView {
  return {
    id: `00000000-0000-4000-8000-0000000003${String(index).padStart(2, '0')}`,
    name,
    text,
    createdAt: new Date('2026-11-26T09:00:00Z'),
    updatedAt: new Date('2026-11-26T09:00:00Z'),
  };
}

function problem(status: number, code: string): ResponseError {
  return new ResponseError(
    new Response(
      JSON.stringify({
        status,
        code,
        title: code,
        detail: code,
        type: 'conflict',
      }),
      {
        status,
        headers: { 'Content-Type': 'application/problem+json' },
      },
    ),
  );
}

function renderPanel(calls: Partial<Record<string, unknown>>) {
  const api = calls as unknown as ServerAdminSupportReportsApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ServerAdminReplyTemplatesPanel api={api} />
    </QueryClientProvider>,
  );
}

function fill(dialog: HTMLElement, name: string, text: string) {
  fireEvent.change(within(dialog).getByLabelText(sheet.nameLabel), {
    target: { value: name },
  });
  fireEvent.change(within(dialog).getByLabelText(sheet.textLabel), {
    target: { value: text },
  });
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe('ServerAdminReplyTemplatesPanel', () => {
  it('lists the templates with their first line', async () => {
    renderPanel({
      listSupportReplyTemplates: vi
        .fn()
        .mockResolvedValue({ items: [template(1), template(2)] }),
    });

    const list = await screen.findByRole('list', { name: templates.listLabel });

    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByText('Template 1')).toBeTruthy();
    expect(within(list).getByText('Text 1')).toBeTruthy();
    expect(within(list).queryByText(/second line/)).toBeNull();
  });

  it('explains the empty state and offers the filled create action', async () => {
    renderPanel({
      listSupportReplyTemplates: vi.fn().mockResolvedValue({ items: [] }),
    });

    expect(await screen.findByText(templates.emptyTitle)).toBeTruthy();
    const create = screen.getByRole('button', { name: templates.create });
    expect(create.className).toContain('add-action');
  });

  it('creates a template from the sheet', async () => {
    const created = template(3, 'Thanks', 'Thanks for your report!');
    const listSupportReplyTemplates = vi
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValue({ items: [created] });
    const createSupportReplyTemplate = vi.fn().mockResolvedValue(created);
    renderPanel({ listSupportReplyTemplates, createSupportReplyTemplate });

    fireEvent.click(
      await screen.findByRole('button', { name: templates.create }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: sheet.createTitle,
    });
    fill(dialog, 'Thanks', 'Thanks for your report!');
    fireEvent.click(
      within(dialog).getByRole('button', { name: germanUi.common.save }),
    );

    await waitFor(() =>
      expect(createSupportReplyTemplate).toHaveBeenCalledWith({
        supportReplyTemplateWrite: {
          name: 'Thanks',
          text: 'Thanks for your report!',
        },
      }),
    );
    expect(await screen.findByText(templates.saved)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Thanks')).toBeTruthy();
  });

  it('asks for a name and a text before saving', async () => {
    const createSupportReplyTemplate = vi.fn();
    renderPanel({
      listSupportReplyTemplates: vi.fn().mockResolvedValue({ items: [] }),
      createSupportReplyTemplate,
    });
    fireEvent.click(
      await screen.findByRole('button', { name: templates.create }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: sheet.createTitle,
    });

    fireEvent.click(
      within(dialog).getByRole('button', { name: germanUi.common.save }),
    );

    expect(within(dialog).getByText(sheet.nameRequired)).toBeTruthy();
    expect(within(dialog).getByText(sheet.textRequired)).toBeTruthy();
    expect(createSupportReplyTemplate).not.toHaveBeenCalled();
  });

  it('edits a template', async () => {
    const original = template(1);
    const updateSupportReplyTemplate = vi
      .fn()
      .mockResolvedValue({ ...original, text: 'Changed' });
    renderPanel({
      listSupportReplyTemplates: vi
        .fn()
        .mockResolvedValue({ items: [original] }),
      updateSupportReplyTemplate,
    });

    fireEvent.click(await screen.findByRole('button', { name: /Template 1/ }));
    const dialog = await screen.findByRole('dialog', { name: sheet.editTitle });
    expect(
      (within(dialog).getByLabelText(sheet.nameLabel) as HTMLInputElement)
        .value,
    ).toBe('Template 1');
    fireEvent.change(within(dialog).getByLabelText(sheet.textLabel), {
      target: { value: 'Changed' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: germanUi.common.save }),
    );

    await waitFor(() =>
      expect(updateSupportReplyTemplate).toHaveBeenCalledWith({
        templateId: original.id,
        supportReplyTemplateWrite: { name: 'Template 1', text: 'Changed' },
      }),
    );
    expect(await screen.findByText(templates.saved)).toBeTruthy();
  });

  it('deletes a template after confirmation', async () => {
    const original = template(1);
    const deleteSupportReplyTemplate = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      listSupportReplyTemplates: vi
        .fn()
        .mockResolvedValueOnce({ items: [original] })
        .mockResolvedValue({ items: [] }),
      deleteSupportReplyTemplate,
    });

    fireEvent.click(await screen.findByRole('button', { name: /Template 1/ }));
    const dialog = await screen.findByRole('dialog', { name: sheet.editTitle });
    fireEvent.click(
      within(dialog).getByRole('button', { name: germanUi.common.delete }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      sheet.deleteConfirm.replace('{{name}}', 'Template 1'),
    );
    await waitFor(() =>
      expect(deleteSupportReplyTemplate).toHaveBeenCalledWith({
        templateId: original.id,
      }),
    );
    expect(await screen.findByText(templates.deleted)).toBeTruthy();
  });

  it('keeps a taken name in the sheet with its message', async () => {
    renderPanel({
      listSupportReplyTemplates: vi
        .fn()
        .mockResolvedValue({ items: [template(1)] }),
      createSupportReplyTemplate: vi
        .fn()
        .mockRejectedValue(problem(409, 'SUPPORT_TEMPLATE_NAME_TAKEN')),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: templates.create }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: sheet.createTitle,
    });
    fill(dialog, 'template 1', 'Some text');
    fireEvent.click(
      within(dialog).getByRole('button', { name: germanUi.common.save }),
    );

    expect(
      await within(dialog).findByText(templates.errors.nameTaken),
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText(sheet.nameLabel) as HTMLInputElement)
        .value,
    ).toBe('template 1');
  });

  it('closes the sheet and refreshes when the template is gone', async () => {
    const listSupportReplyTemplates = vi
      .fn()
      .mockResolvedValueOnce({ items: [template(1)] })
      .mockResolvedValue({ items: [] });
    renderPanel({
      listSupportReplyTemplates,
      updateSupportReplyTemplate: vi
        .fn()
        .mockRejectedValue(problem(404, 'SUPPORT_TEMPLATE_NOT_FOUND')),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Template 1/ }));
    const dialog = await screen.findByRole('dialog', { name: sheet.editTitle });
    fireEvent.click(
      within(dialog).getByRole('button', { name: germanUi.common.save }),
    );

    expect(await screen.findByText(templates.gone)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(listSupportReplyTemplates).toHaveBeenCalledTimes(2),
    );
  });

  it('hides the create action at the limit and says why', async () => {
    renderPanel({
      listSupportReplyTemplates: vi.fn().mockResolvedValue({
        items: Array.from({ length: 30 }, (_, index) => template(index)),
      }),
    });

    expect(
      await screen.findByText(templates.limitHint.replace('{{max}}', '30')),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: templates.create })).toBeNull();
  });

  it('blocks writes while offline', async () => {
    onlineManager.setOnline(false);
    renderPanel({
      listSupportReplyTemplates: vi
        .fn()
        .mockResolvedValue({ items: [template(1)] }),
    });

    expect(await screen.findByText(templates.offlineNotice)).toBeTruthy();
    expect(
      (
        (await screen.findByRole('button', {
          name: templates.create,
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('closes the sheet with Escape and asks first when it was changed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    renderPanel({
      listSupportReplyTemplates: vi.fn().mockResolvedValue({ items: [] }),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: templates.create }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: sheet.createTitle,
    });
    fill(dialog, 'Draft', 'Draft text');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(confirm).toHaveBeenCalledWith(sheet.discardConfirm);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
