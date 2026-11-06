// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import type { ImportantDateView } from '../api/generated/models/ImportantDateView';
import { PersonRelationship } from '../api/generated/models/PersonRelationship';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import importantDates from '../i18n/locales/importantDates';
import { ImportantDatesPanel } from './ImportantDatesPanel';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches: media === '(prefers-reduced-motion: reduce)',
      media,
      addEventListener() {},
      removeEventListener() {},
    })),
  });
});
afterEach(() => cleanup());

const person: RelatedPersonView = {
  id: 'person-1',
  displayName: 'Lisa Example',
  relationship: PersonRelationship.FRIEND,
  birthday: null,
  birthdayYearKnown: false,
  visibility: ContentVisibility.SHARED,
  showBirthdayOnDashboard: false,
  avatarAttachmentId: null,
  version: 2,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

const date: ImportantDateView = {
  id: 'date-1',
  label: 'Our first shared seaside holiday',
  date: new Date('2026-09-21T00:00:00Z'),
  relatedPersonId: person.id,
  repeats: DateRepeat.ANNUALLY,
  type: ImportantDateType.ANNIVERSARY,
  visibility: ContentVisibility.SHARED,
  version: 3,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function importantDate(
  id: string,
  label: string,
  overrides: Partial<ImportantDateView> = {},
): ImportantDateView {
  return { ...date, id, label, ...overrides };
}

function createMockPeopleApi(dates: ImportantDateView[] = [date]): PeopleApi {
  let values = [...dates];
  return {
    listImportantDatesApiV1SpacesSpaceIdImportantDatesGet: vi
      .fn()
      .mockImplementation(async () => values),
    createImportantDateApiV1SpacesSpaceIdImportantDatesPost: vi
      .fn()
      .mockImplementation(({ importantDateFields }) =>
        Promise.resolve(
          values[
            values.push({
              id: 'date-new',
              ...importantDateFields,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            }) - 1
          ],
        ),
      ),
    updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut: vi
      .fn()
      .mockImplementation(async ({ dateId, importantDateFields }) => {
        const saved = {
          id: dateId,
          ...importantDateFields,
          version: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        values = values.map((value) => (value.id === dateId ? saved : value));
        return saved;
      }),
    deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete: vi
      .fn()
      .mockImplementation(async ({ dateId }) => {
        values = values.filter((value) => value.id !== dateId);
      }),
  } as unknown as PeopleApi;
}

function renderPanel(
  peopleApi = createMockPeopleApi(),
  partnerBirthday: {
    accountId: string;
    birthday: Date;
    displayName: string;
  } | null = null,
  people = [person],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <MemoryRouter initialEntries={['/plan#dates']}>
      <QueryClientProvider client={queryClient}>
        <ImportantDatesPanel
          peopleApi={peopleApi}
          spaceId="space-1"
          people={people}
          partnerBirthday={partnerBirthday}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ImportantDatesPanel mobile-first surface', () => {
  it('projects the active partner birthday without creating an editable ImportantDate', async () => {
    const { container } = renderPanel(createMockPeopleApi([]), {
      accountId: 'partner-1',
      birthday: new Date('1992-05-14T00:00:00Z'),
      displayName: 'Alex',
    });

    await screen.findByText('Geburtstag von Alex');
    const derived = screen.getByRole('button', { name: /Geburtstag von Alex/ });
    fireEvent.click(derived);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    expect(
      within(screen.getByRole('dialog')).queryByRole('button', {
        name: importantDates.edit,
      }),
    ).toBeNull();
    expect(container.querySelectorAll('.important-date-card')).toHaveLength(1);
    expect(screen.queryByText(importantDates.emptyTitle)).toBeNull();
  });

  it('deduplicates an existing shared birthday without hiding an independent private date', async () => {
    const birthday = { ...person, birthday: new Date('2000-05-14T00:00:00Z') };
    const explicit = {
      ...date,
      label: 'Existing birthday',
      type: ImportantDateType.BIRTHDAY,
      date: birthday.birthday,
    };
    renderPanel(
      createMockPeopleApi([
        explicit,
        {
          ...explicit,
          id: 'private-birthday',
          label: 'Private birthday note',
          visibility: ContentVisibility.PRIVATE,
        },
      ]),
      null,
      [birthday],
    );
    await screen.findByRole('button', { name: /Existing birthday/ });
    expect(
      screen.queryByRole('button', {
        name: new RegExp(
          importantDates.partnerBirthdayLabel.replace(
            '{{name}}',
            person.displayName,
          ),
        ),
      }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: /Private birthday note/ }),
    ).not.toBeNull();
  });

  it('projects a shared birthday even when the only explicit birthday date is private', async () => {
    const birthday = { ...person, birthday: new Date('2000-05-14T00:00:00Z') };
    renderPanel(
      createMockPeopleApi([
        {
          ...date,
          type: ImportantDateType.BIRTHDAY,
          date: birthday.birthday,
          visibility: ContentVisibility.PRIVATE,
        },
      ]),
      null,
      [birthday],
    );
    await screen.findByRole('button', {
      name: new RegExp(
        importantDates.partnerBirthdayLabel.replace(
          '{{name}}',
          person.displayName,
        ),
      ),
    });
    await waitFor(() =>
      expect(document.querySelectorAll('.important-date-card')).toHaveLength(2),
    );
  });

  it('renders a date-led timeline with concise independent-date privacy context', async () => {
    const { container } = renderPanel();

    const card = await screen.findByRole('button', {
      name: new RegExp(date.label, 'i'),
    });
    expect(card.classList.contains('important-date-card')).toBe(true);
    expect(card.querySelector('.important-date-marker')).not.toBeNull();
    expect(card.textContent).toContain(date.label);
    expect(card.textContent).toContain(importantDates.repeats.ANNUALLY);
    expect(card.textContent).toContain(importantDates.visibility.SHARED);
    expect(card.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.important-date-chip')).toBeNull();
  });

  it('opens W51 as a focused Compact-first sheet with date and meaning first', async () => {
    const { container } = renderPanel();
    await screen.findByRole('button', { name: new RegExp(date.label, 'i') });

    const trigger = screen.getByRole('button', {
      name: importantDates.create,
    });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains('focused-editor-sheet')).toBe(true);
    expect(dialog.classList.contains('important-date-editor')).toBe(true);
    expect(
      screen.getByRole('heading', { name: importantDates.createTitle }),
    ).not.toBeNull();

    const dateInput = screen.getByLabelText(
      importantDates.dateLabel,
    ) as HTMLInputElement;
    const labelInput = screen.getByLabelText(
      importantDates.labelLabel,
    ) as HTMLInputElement;
    expect(dateInput).toBe(document.activeElement);
    expect(dateInput.required).toBe(true);
    expect(labelInput.required).toBe(true);
    expect(labelInput.maxLength).toBe(120);

    const disclosure = container.querySelector(
      '.important-date-editor .focused-editor-disclosure',
    ) as HTMLDetailsElement | null;
    expect(disclosure).not.toBeNull();
    expect(disclosure?.open).toBe(false);
    expect(
      within(dialog).getByRole('combobox', {
        name: importantDates.visibilityLabel,
      }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole('button', { name: importantDates.create }),
    ).not.toBeNull();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });

  it('protects W53 by confirming discard on Escape after a create draft changes', async () => {
    renderPanel();
    await screen.findByRole('button', { name: new RegExp(date.label, 'i') });

    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText(importantDates.labelLabel), {
      target: { value: 'A new important date' },
    });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(
      screen.getByText(importantDates.discardTitle, { selector: 'strong' }),
    ).not.toBeNull();
    expect(screen.getByRole('dialog')).not.toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: importantDates.keepEditing }),
    );
    expect(screen.queryByText(importantDates.discardTitle)).toBeNull();
    expect(screen.getByRole('dialog')).not.toBeNull();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.discardConfirm }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps a dirty draft on backdrop dismissal until discard is confirmed', async () => {
    const { container } = renderPanel();
    await screen.findByRole('button', { name: new RegExp(date.label, 'i') });
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    const labelInput = screen.getByLabelText(
      importantDates.labelLabel,
    ) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Still editing' } });

    const backdrop = container.querySelector('.focused-editor-backdrop');
    if (!backdrop) throw new Error('editor backdrop not found');
    fireEvent.click(backdrop);

    expect(screen.getByText(importantDates.discardTitle)).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.keepEditing }),
    );
    expect(labelInput.value).toBe('Still editing');
  });

  it('uses Browser Back to close a clean editor', async () => {
    renderPanel();
    await screen.findByRole('button', { name: new RegExp(date.label, 'i') });
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    await waitFor(() =>
      expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );

    window.history.back();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('uses Browser Back to confirm a dirty draft without losing it', async () => {
    renderPanel();
    await screen.findByRole('button', { name: new RegExp(date.label, 'i') });
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    await waitFor(() =>
      expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );
    const labelInput = screen.getByLabelText(
      importantDates.labelLabel,
    ) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Back-safe draft' } });

    window.history.back();

    await screen.findByText(importantDates.discardTitle);
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.keepEditing }),
    );
    expect(labelInput.value).toBe('Back-safe draft');
    expect(screen.getByRole('dialog')).not.toBeNull();

    window.history.back();
    await screen.findByText(importantDates.discardTitle);
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.discardConfirm }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens the reader then the focused editor from the full timeline item and separates delete from Save', async () => {
    const { container } = renderPanel();
    const card = await screen.findByRole('button', {
      name: new RegExp(date.label, 'i'),
    });
    card.focus();
    fireEvent.click(card);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);

    const dialog = screen.getByRole('dialog');
    expect(
      screen.getByRole('heading', { name: importantDates.editTitle }),
    ).not.toBeNull();
    expect(screen.getByDisplayValue(date.label)).not.toBeNull();

    const disclosure = container.querySelector(
      '.important-date-editor .focused-editor-disclosure',
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(true);
    expect(screen.getByDisplayValue(person.displayName)).not.toBeNull();

    const deleteButton = within(dialog).getByRole('button', {
      name: importantDates.delete,
    });
    expect(deleteButton.closest('.focused-editor-danger-zone')).not.toBeNull();
    expect(
      within(dialog).getByRole('button', { name: importantDates.saveChanges }),
    ).not.toBeNull();
  });

  it('protects W53 delete confirmation before invoking the delete mutation', async () => {
    const peopleApi = createMockPeopleApi();
    renderPanel(peopleApi);
    const card = await screen.findByRole('button', {
      name: new RegExp(date.label, 'i'),
    });
    fireEvent.click(card);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);

    fireEvent.click(
      screen.getByRole('button', { name: importantDates.delete }),
    );
    expect(
      screen.getByText(importantDates.deleteQuestion, { selector: 'strong' }),
    ).not.toBeNull();
    expect(
      peopleApi.deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete,
    ).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: importantDates.deleteConfirm }),
    );
    await waitFor(() => {
      expect(
        peopleApi.deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete,
      ).toHaveBeenCalledTimes(1);
    });
  });

  it('preserves API semantics when saving an edited date', async () => {
    const peopleApi = createMockPeopleApi();
    renderPanel(peopleApi);
    const card = await screen.findByRole('button', {
      name: new RegExp(date.label, 'i'),
    });
    card.focus();
    fireEvent.click(card);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);

    fireEvent.change(screen.getByLabelText(importantDates.labelLabel), {
      target: { value: 'Our seaside anniversary' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.saveChanges }),
    );

    await waitFor(() => {
      expect(
        peopleApi.updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut,
      ).toHaveBeenCalledTimes(1);
    });
    await screen.findByRole('heading', { name: 'Our seaside anniversary' });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Schließen',
      }),
    );
    await waitFor(() => expect(document.activeElement).toBe(card));
    const call = (
      peopleApi.updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut as ReturnType<
        typeof vi.fn
      >
    ).mock.calls[0][0];
    expect(call.dateId).toBe(date.id);
    expect(call.ifMatch).toBe(String(date.version));
    expect(call.importantDateFields.label).toBe('Our seaside anniversary');
    expect(call.importantDateFields.relatedPersonId).toBe(person.id);
    expect(call.importantDateFields.visibility).toBe(date.visibility);
  });

  it('keeps long labels intact instead of truncating relationship content in the DOM', async () => {
    const longLabel =
      'A very long important date label describing the beginning of an exceptionally long shared journey together';
    renderPanel(createMockPeopleApi([{ ...date, label: longLabel }]));

    const card = await screen.findByRole('button', {
      name: /A very long important date label/i,
    });
    expect(card.textContent).toContain(longLabel);
    fireEvent.click(card);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);
    expect(screen.getByDisplayValue(longLabel)).not.toBeNull();
  });

  it('accepts 120 label characters and prevents a 121st character', async () => {
    const user = userEvent.setup();
    const peopleApi = createMockPeopleApi();
    renderPanel(peopleApi);
    await screen.findByRole('button', { name: new RegExp(date.label, 'i') });
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    fireEvent.change(screen.getByLabelText(importantDates.dateLabel), {
      target: { value: '2026-10-20' },
    });
    const labelInput = screen.getByLabelText(
      importantDates.labelLabel,
    ) as HTMLInputElement;

    await user.type(labelInput, 'x'.repeat(121));
    expect(labelInput.value).toHaveLength(120);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: importantDates.create,
      }),
    );

    await waitFor(() =>
      expect(
        peopleApi.createImportantDateApiV1SpacesSpaceIdImportantDatesPost,
      ).toHaveBeenCalledTimes(1),
    );
    const call = (
      peopleApi.createImportantDateApiV1SpacesSpaceIdImportantDatesPost as ReturnType<
        typeof vi.fn
      >
    ).mock.calls[0][0];
    expect(call.importantDateFields.label).toHaveLength(120);
  });

  it('announces private visibility without inventing a linked person', async () => {
    const privateDate = importantDate('date-private', 'A private day', {
      relatedPersonId: null,
      visibility: ContentVisibility.PRIVATE,
    });
    renderPanel(createMockPeopleApi([privateDate]));

    const card = await screen.findByRole('button', {
      name: new RegExp(importantDates.visibility.PRIVATE, 'i'),
    });
    expect(card.textContent).toContain(privateDate.label);
    expect(card.textContent).toContain(importantDates.visibility.PRIVATE);
    expect(card.textContent).not.toContain(person.displayName);
  });

  async function expectFocusAfterDelete(
    dates: ImportantDateView[],
    deletedLabel: string,
    expectedName: string | RegExp,
  ) {
    renderPanel(createMockPeopleApi(dates));
    const deletedCard = await screen.findByRole('button', {
      name: new RegExp(deletedLabel, 'i'),
    });
    fireEvent.click(deletedCard);
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.delete }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.deleteConfirm }),
    );

    const expectedTarget = await screen.findByRole('button', {
      name: expectedName,
    });
    await waitFor(() => expect(document.activeElement).toBe(expectedTarget));
  }

  it('focuses the next date after deleting a middle item', async () => {
    await expectFocusAfterDelete(
      [
        importantDate('date-first', 'First date'),
        importantDate('date-middle', 'Middle date'),
        importantDate('date-last', 'Last date'),
      ],
      'Middle date',
      /Last date/i,
    );
  });

  it('focuses the previous date after deleting the last item', async () => {
    await expectFocusAfterDelete(
      [
        importantDate('date-first', 'First date'),
        importantDate('date-last', 'Last date'),
      ],
      'Last date',
      /First date/i,
    );
  });

  it('focuses the create action after deleting the only date', async () => {
    await expectFocusAfterDelete(
      [importantDate('date-only', 'Only date')],
      'Only date',
      importantDates.create,
    );
  });
});
