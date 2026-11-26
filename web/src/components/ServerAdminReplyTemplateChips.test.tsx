// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReplyTemplateView } from '../api/generated/models/SupportReplyTemplateView';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminReplyTemplateChips } from './ServerAdminReplyTemplateChips';

const templates = serverAdmin.templates;

function template(
  name: string,
  text: string,
  index = 1,
): SupportReplyTemplateView {
  return {
    id: `00000000-0000-4000-8000-00000000010${index}`,
    name,
    text,
    createdAt: new Date('2026-11-26T09:00:00Z'),
    updatedAt: new Date('2026-11-26T09:00:00Z'),
  };
}

function renderChips(
  listSupportReplyTemplates: ReturnType<typeof vi.fn>,
  props: { disabled?: boolean; withEdit?: boolean } = {},
) {
  const onInsert = vi.fn();
  const onEdit = vi.fn();
  const api = {
    listSupportReplyTemplates,
  } as unknown as ServerAdminSupportReportsApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ServerAdminReplyTemplateChips
        api={api}
        disabled={props.disabled ?? false}
        onInsert={onInsert}
        onEdit={props.withEdit === false ? undefined : onEdit}
      />
    </QueryClientProvider>,
  );
  return { onInsert, onEdit };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ServerAdminReplyTemplateChips', () => {
  it('offers one chip per template and inserts its text', async () => {
    const { onInsert } = renderChips(
      vi.fn().mockResolvedValue({
        items: [
          template('Thanks', 'Thanks for your report!', 1),
          template('Fixed', 'It is fixed now.', 2),
        ],
      }),
    );

    expect(await screen.findByText(templates.chipsTitle)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Fixed' }));

    expect(onInsert).toHaveBeenCalledWith('It is fixed now.');
    expect(screen.getByRole('button', { name: 'Thanks' })).toBeTruthy();
    // The chips are a list named by their title.
    expect(
      screen.getByRole('list', { name: templates.chipsTitle }),
    ).toBeTruthy();
  });

  it('leads to the templates page from the edit link', async () => {
    const { onEdit } = renderChips(
      vi.fn().mockResolvedValue({ items: [template('Thanks', 'Thanks!')] }),
    );

    fireEvent.click(
      await screen.findByRole('button', { name: templates.edit }),
    );

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('explains the empty state and links to creating one', async () => {
    const { onEdit } = renderChips(vi.fn().mockResolvedValue({ items: [] }));

    expect(await screen.findByText(templates.emptyHint)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: templates.emptyLink }));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('disables the chips while the reply cannot be written', async () => {
    renderChips(
      vi.fn().mockResolvedValue({ items: [template('Thanks', 'Thanks!')] }),
      { disabled: true },
    );

    const chip = await screen.findByRole('button', { name: 'Thanks' });

    expect(chip.hasAttribute('disabled')).toBe(true);
  });

  it('says quietly when the templates cannot load', async () => {
    renderChips(vi.fn().mockRejectedValue(new Error('boom')));

    expect(await screen.findByText(templates.loadError)).toBeTruthy();
  });

  it('hides the edit link where no templates page exists', async () => {
    renderChips(
      vi.fn().mockResolvedValue({ items: [template('Thanks', 'Thanks!')] }),
      { withEdit: false },
    );

    await screen.findByRole('button', { name: 'Thanks' });

    expect(screen.queryByRole('button', { name: templates.edit })).toBeNull();
  });
});
