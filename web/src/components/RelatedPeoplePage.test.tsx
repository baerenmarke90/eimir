// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { PersonRelationship } from '../api/generated/models/PersonRelationship';
import { RelatedPersonDeletePolicy } from '../api/generated/models/RelatedPersonDeletePolicy';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import de from '../i18n/locales/de';
import people from '../i18n/locales/people';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import {
  DeleteRelatedPersonDialogContent,
  RelatedPeoplePage,
} from './RelatedPeoplePage';

afterEach(() => {
  cleanup();
});

const person: RelatedPersonView = {
  id: 'person-1',
  displayName: 'Lisa',
  relationship: PersonRelationship.FRIEND,
  birthday: new Date('1995-05-12T00:00:00Z'),
  birthdayYearKnown: true,
  visibility: ContentVisibility.SHARED,
  showBirthdayOnDashboard: false,
  avatarAttachmentId: null,
  version: 3,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function relatedPerson(id: string, displayName: string): RelatedPersonView {
  return { ...person, id, displayName };
}

function renderChoice(
  policy:
    | typeof RelatedPersonDeletePolicy.preserve
    | typeof RelatedPersonDeletePolicy.cascade
    | null,
  cascadeConfirmed = false,
): string {
  return renderToStaticMarkup(
    <DeleteRelatedPersonDialogContent
      person={person}
      pending={false}
      error={null}
      choice={{ policy, cascadeConfirmed }}
      onSelectPolicy={() => undefined}
      onCascadeConfirmed={() => undefined}
      onCancel={() => undefined}
      onDelete={() => undefined}
    />,
  );
}

describe('RelatedPerson delete dialog', () => {
  it('starts without a delete-policy default and exposes dialog semantics', () => {
    const html = renderChoice(null);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('value="preserve"');
    expect(html).toContain('value="cascade"');
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('disabled=""');
  });

  it('allows preserve without presenting a destructive warning', () => {
    const html = renderChoice(RelatedPersonDeletePolicy.preserve);

    expect(html).toContain('checked="" value="preserve"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('disabled=""');
  });

  it('shows a privacy-safe warning and blocks unconfirmed cascade', () => {
    const html = renderChoice(RelatedPersonDeletePolicy.cascade);

    expect(html).toContain('checked="" value="cascade"');
    expect(html).toContain('role="alert"');
    expect(html).toContain(people.deletePrivacyNote);
    expect(html).toContain(people.deleteCascadeWarningBody);
    expect(html).toContain('disabled=""');
  });

  it('enables cascade only after the explicit second confirmation', () => {
    const html = renderChoice(RelatedPersonDeletePolicy.cascade, true);

    expect(html).toContain('role="alert"');
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).not.toContain('disabled=""');
  });
});

describe('RelatedPeoplePage mobile-first surface', () => {
  function createMockPeopleApi(
    initialPeople: RelatedPersonView[] = [person],
  ): PeopleApi {
    return {
      listRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGet: vi
        .fn()
        .mockResolvedValue(initialPeople),
      createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost: vi
        .fn()
        .mockImplementation(({ relatedPersonFields }) =>
          Promise.resolve({
            id: 'person-new',
            ...relatedPersonFields,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut: vi
        .fn()
        .mockImplementation(({ personId, relatedPersonFields }) =>
          Promise.resolve({
            id: personId,
            ...relatedPersonFields,
            version: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete: vi
        .fn()
        .mockResolvedValue(undefined),
      listImportantDatesApiV1SpacesSpaceIdImportantDatesGet: vi
        .fn()
        .mockResolvedValue([]),
    } as unknown as PeopleApi;
  }

  function renderRelatedPeoplePage(peopleApi = createMockPeopleApi()) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <RelatedPeoplePage peopleApi={peopleApi} spaceId="space-1" />
      </QueryClientProvider>,
    );
  }

  it('protects W08 by keeping the avatar-led people overview without a side rail', async () => {
    const { container } = renderRelatedPeoplePage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Lisa' })).not.toBeNull();
    });

    expect(container.querySelector('.layout-rail')).toBeNull();
    expect(container.querySelector('.layout-split')).toBeNull();

    const card = container.querySelector('.people-card');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain(people.relationship.FRIEND);
    expect(card?.textContent).toContain(people.visibility.SHARED);
    expect(card?.textContent).toContain('LI');
  });

  it('opens W54 as a focused sheet with identity first and optional birthday disclosure', async () => {
    const { container } = renderRelatedPeoplePage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Lisa' })).not.toBeNull();
    });

    const addButton = screen.getByRole('button', {
      name: new RegExp(people.addPersonAction, 'i'),
    });
    addButton.focus();
    fireEvent.click(addButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains('focused-editor-sheet')).toBe(true);
    expect(
      screen.getByRole('heading', { name: people.createTitle }),
    ).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: people.identitySectionTitle }),
    ).not.toBeNull();

    const nameInput = screen.getByLabelText(
      people.nameLabel,
    ) as HTMLInputElement;
    expect(nameInput).toBe(document.activeElement);
    expect(nameInput.required).toBe(true);
    expect(nameInput.maxLength).toBe(120);

    const birthdayDisclosure = container.querySelector(
      '.focused-editor-disclosure',
    ) as HTMLDetailsElement | null;
    expect(birthdayDisclosure).not.toBeNull();
    expect(birthdayDisclosure?.open).toBe(false);

    expect(
      within(dialog).getByRole('combobox', { name: people.visibilityLabel }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole('button', { name: people.create }),
    ).not.toBeNull();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(addButton).toBe(document.activeElement);
  });

  it('confirms dirty Escape and keeps or discards the person draft explicitly', async () => {
    renderRelatedPeoplePage();
    await screen.findByRole('heading', { name: 'Lisa' });
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(people.addPersonAction, 'i'),
      }),
    );
    const dialog = screen.getByRole('dialog');
    const nameInput = screen.getByLabelText(
      people.nameLabel,
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Draft name' } });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByText(people.discardTitle)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: people.keepEditing }));
    expect(nameInput.value).toBe('Draft name');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(
      screen.getByRole('button', { name: people.discardConfirm }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirms dirty backdrop dismissal for relationship and privacy changes', async () => {
    const { container } = renderRelatedPeoplePage();
    await screen.findByRole('heading', { name: 'Lisa' });
    const personCard = screen
      .getByRole('heading', { name: 'Lisa' })
      .closest('.people-card');
    if (!personCard) throw new Error('person card not found');
    fireEvent.click(personCard);
    fireEvent.change(screen.getByLabelText(people.relationshipLabel), {
      target: { value: PersonRelationship.PARENT },
    });
    const visibility = screen.getByRole('combobox', {
      name: people.visibilityLabel,
    }) as HTMLSelectElement;
    fireEvent.change(visibility, {
      target: { value: ContentVisibility.PRIVATE },
    });

    const backdrop = container.querySelector('.focused-editor-backdrop');
    if (!backdrop) throw new Error('editor backdrop not found');
    fireEvent.click(backdrop);

    expect(screen.getByText(people.discardTitle)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: people.keepEditing }));
    expect(visibility.value).toBe(ContentVisibility.PRIVATE);
  });

  it('uses Browser Back to close a clean person editor', async () => {
    renderRelatedPeoplePage();
    await screen.findByRole('heading', { name: 'Lisa' });
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(people.addPersonAction, 'i'),
      }),
    );
    await waitFor(() =>
      expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );

    window.history.back();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('uses Browser Back to protect a dirty birthday draft', async () => {
    const { container } = renderRelatedPeoplePage();
    await screen.findByRole('heading', { name: 'Lisa' });
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(people.addPersonAction, 'i'),
      }),
    );
    await waitFor(() =>
      expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );
    const disclosure = container.querySelector(
      '.focused-editor-disclosure',
    ) as HTMLDetailsElement;
    fireEvent.click(within(disclosure).getByText(people.birthdayLabel));
    const birthdayInput = screen.getByLabelText(
      people.birthdayDateLabel,
    ) as HTMLInputElement;
    fireEvent.change(birthdayInput, { target: { value: '1990-06-15' } });

    window.history.back();

    await screen.findByText(people.discardTitle);
    fireEvent.click(screen.getByRole('button', { name: people.keepEditing }));
    expect(birthdayInput.value).toBe('1990-06-15');
    expect(screen.getByRole('dialog')).not.toBeNull();

    window.history.back();
    await screen.findByText(people.discardTitle);
    fireEvent.click(
      screen.getByRole('button', { name: people.discardConfirm }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens W55 from the full person card and keeps destructive lifecycle separate', async () => {
    renderRelatedPeoplePage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Lisa' })).not.toBeNull();
    });

    const card = screen
      .getByRole('heading', { name: 'Lisa' })
      .closest('.people-card');
    if (!card) throw new Error('card not found');
    (card as HTMLElement).focus();
    fireEvent.click(card);

    const editDialog = screen.getByRole('dialog');
    expect(editDialog.classList.contains('related-person-editor')).toBe(true);
    expect(
      screen.getByRole('heading', { name: people.editTitle }),
    ).not.toBeNull();
    expect(screen.getByDisplayValue('Lisa')).not.toBeNull();

    const deleteButton = screen.getByRole('button', { name: people.delete });
    expect(deleteButton.closest('.focused-editor-danger-zone')).not.toBeNull();
    expect(
      within(editDialog).getByRole('button', { name: people.saveChanges }),
    ).not.toBeNull();

    fireEvent.click(deleteButton);
    expect(
      screen.getByRole('heading', { name: people.deleteTitle }),
    ).not.toBeNull();
    expect(
      screen.getByText(new RegExp(people.deletePreserveTitle, 'i')),
    ).not.toBeNull();

    const cancelButton = screen.getByRole('button', { name: de.common.cancel });
    fireEvent.click(cancelButton);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the Dashboard-visibility toggle conditional on a birthday', async () => {
    const { container } = renderRelatedPeoplePage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Lisa' })).not.toBeNull();
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(people.addPersonAction, 'i'),
      }),
    );

    expect(screen.queryByLabelText(people.birthdayShowOnDashboard)).toBeNull();

    const disclosure = container.querySelector(
      '.focused-editor-disclosure',
    ) as HTMLDetailsElement;
    fireEvent.click(within(disclosure).getByText(people.birthdayLabel));

    const birthdayInput = container.querySelector<HTMLInputElement>(
      '#related-person-birthday',
    );
    if (!birthdayInput) throw new Error('birthday input not found');
    fireEvent.change(birthdayInput, { target: { value: '1990-06-15' } });

    const toggle = screen.getByLabelText(
      people.birthdayShowOnDashboard,
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('submits the enabled Dashboard-visibility toggle for a new person', async () => {
    const peopleApi = createMockPeopleApi();
    const { container } = renderRelatedPeoplePage(peopleApi);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Lisa' })).not.toBeNull();
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(people.addPersonAction, 'i'),
      }),
    );

    fireEvent.change(screen.getByLabelText(people.nameLabel), {
      target: { value: 'Nina' },
    });
    const birthdayInput = container.querySelector<HTMLInputElement>(
      '#related-person-birthday',
    );
    if (!birthdayInput) throw new Error('birthday input not found');
    fireEvent.change(birthdayInput, { target: { value: '1990-06-15' } });
    fireEvent.click(screen.getByLabelText(people.birthdayShowOnDashboard));

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: people.create,
      }),
    );

    await waitFor(() => {
      expect(
        peopleApi.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost,
      ).toHaveBeenCalledTimes(1);
    });
    const call = (
      peopleApi.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost as ReturnType<
        typeof vi.fn
      >
    ).mock.calls[0][0];
    expect(call.relatedPersonFields.showBirthdayOnDashboard).toBe(true);
  });

  it('reflects and persists the existing person Dashboard-visibility state on edit', async () => {
    const shownPerson: RelatedPersonView = {
      ...person,
      showBirthdayOnDashboard: true,
    };
    const peopleApi = createMockPeopleApi([shownPerson]);
    renderRelatedPeoplePage(peopleApi);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Lisa' })).not.toBeNull();
    });
    const card = screen
      .getByRole('heading', { name: 'Lisa' })
      .closest('.people-card');
    if (!card) throw new Error('card not found');
    (card as HTMLElement).focus();
    fireEvent.click(card);

    const toggle = screen.getByLabelText(
      people.birthdayShowOnDashboard,
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: people.saveChanges }));

    await waitFor(() => {
      expect(
        peopleApi.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut,
      ).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => expect(document.activeElement).toBe(card));
    const call = (
      peopleApi.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut as ReturnType<
        typeof vi.fn
      >
    ).mock.calls[0][0];
    expect(call.relatedPersonFields.showBirthdayOnDashboard).toBe(false);
  });

  it('preserves long names in the editor without changing the stored value', async () => {
    const longName =
      'Alexandra Maximiliane Example-Surname With An Exceptionally Long Display Name';
    const longPerson = { ...person, displayName: longName };
    renderRelatedPeoplePage(createMockPeopleApi([longPerson]));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: longName })).not.toBeNull();
    });
    const card = screen
      .getByRole('heading', { name: longName })
      .closest('.people-card');
    if (!card) throw new Error('card not found');
    fireEvent.click(card);

    expect(screen.getByDisplayValue(longName)).not.toBeNull();
  });

  it('manages body scroll lock and revokes avatar object URLs on replacement and unmount', async () => {
    document.body.style.overflow = 'visible';
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const createObjectURLSpy = vi.fn().mockReturnValue('blob:test-avatar-1');
    const revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy;
    URL.revokeObjectURL = revokeObjectURLSpy;

    renderRelatedPeoplePage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Lisa' })).not.toBeNull();
    });

    const addButton = screen.getByRole('button', {
      name: new RegExp(people.addPersonAction, 'i'),
    });
    fireEvent.click(addButton);

    expect(document.body.style.overflow).toBe('hidden');

    const fileInput = screen.getByLabelText(people.avatarLabel);
    const file1 = new File(['image1'], 'avatar1.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file1] } });
    expect(createObjectURLSpy).toHaveBeenCalledWith(file1);

    createObjectURLSpy.mockReturnValue('blob:test-avatar-2');
    const file2 = new File(['image2'], 'avatar2.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file2] } });
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-avatar-1');

    fireEvent.click(
      screen.getByRole('button', { name: people.closeDialogAria }),
    );

    expect(screen.getByText(people.discardTitle)).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: people.discardConfirm }),
    );

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-avatar-2');
    expect(document.body.style.overflow).toBe('visible');

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  async function expectFocusAfterDelete(
    peopleList: RelatedPersonView[],
    deletedName: string,
    expectedName: string | RegExp,
  ) {
    renderRelatedPeoplePage(createMockPeopleApi(peopleList));
    const deletedCard = await screen.findByRole('button', {
      name: new RegExp(deletedName, 'i'),
    });
    fireEvent.click(deletedCard);
    fireEvent.click(screen.getByRole('button', { name: people.delete }));
    fireEvent.click(
      screen.getByRole('radio', {
        name: new RegExp(people.deletePreserveTitle, 'i'),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: people.deleteConfirm }));

    const expectedTarget = await screen.findByRole('button', {
      name: expectedName,
    });
    await waitFor(() => expect(document.activeElement).toBe(expectedTarget));
  }

  it('focuses the next person after deleting a middle item', async () => {
    await expectFocusAfterDelete(
      [
        relatedPerson('person-first', 'First person'),
        relatedPerson('person-middle', 'Middle person'),
        relatedPerson('person-last', 'Last person'),
      ],
      'Middle person',
      /Last person/i,
    );
  });

  it('focuses the previous person after deleting the last item', async () => {
    await expectFocusAfterDelete(
      [
        relatedPerson('person-first', 'First person'),
        relatedPerson('person-last', 'Last person'),
      ],
      'Last person',
      /First person/i,
    );
  });

  it('focuses the create action after deleting the only person', async () => {
    await expectFocusAfterDelete(
      [relatedPerson('person-only', 'Only person')],
      'Only person',
      new RegExp(people.addPersonAction, 'i'),
    );
  });
});
