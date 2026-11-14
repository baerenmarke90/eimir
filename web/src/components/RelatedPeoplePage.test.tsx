import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { PersonRelationship } from '../api/generated/models/PersonRelationship';
import { RelatedPersonDeletePolicy } from '../api/generated/models/RelatedPersonDeletePolicy';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import people from '../i18n/locales/people';
import taskBoundary from '../i18n/locales/taskBoundary';
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

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  if (!globalThis.CSS)
    Object.defineProperty(globalThis, 'CSS', {
      value: { escape: (value: string) => value },
      configurable: true,
    });
});

describe('shared People profiles and focused tasks', () => {
  function fixture(
    initial: RelatedPersonView[] = [person],
    path = '/more/people',
  ) {
    let rows = initial.slice();
    const api = {
      listRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGet: vi.fn(
        async () => rows,
      ),
      getRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGet: vi.fn(
        async ({ personId }: { personId: string }) =>
          rows.find((p) => p.id === personId),
      ),
      createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost: vi.fn(
        async ({
          relatedPersonFields,
        }: {
          relatedPersonFields: Record<string, unknown>;
        }) => {
          const saved = {
            ...person,
            ...relatedPersonFields,
            id: 'person-new',
            version: 1,
          } as RelatedPersonView;
          rows = [...rows, saved];
          return saved;
        },
      ),
      updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut: vi.fn(
        async ({
          personId,
          relatedPersonFields,
        }: {
          personId: string;
          relatedPersonFields: Record<string, unknown>;
        }) => {
          const saved = {
            ...person,
            ...rows.find((p) => p.id === personId),
            ...relatedPersonFields,
            id: personId,
            version: 4,
          } as RelatedPersonView;
          rows = rows.map((p) => (p.id === personId ? saved : p));
          return saved;
        },
      ),
      deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete: vi.fn(
        async ({ personId }: { personId: string }) => {
          rows = rows.filter((p) => p.id !== personId);
        },
      ),
      listImportantDatesApiV1SpacesSpaceIdImportantDatesGet: vi.fn(
        async () => [],
      ),
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const result = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <RelatedPeoplePage
            peopleApi={api as unknown as PeopleApi}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { ...result, api };
  }
  async function openProfile(name = 'Lisa') {
    fireEvent.click(
      await screen.findByRole('link', { name: new RegExp(`^${name}`) }),
    );
    await screen.findByRole('heading', { name });
  }
  async function editProfile() {
    fireEvent.click(screen.getByRole('link', { name: people.edit }));
    await screen.findByLabelText(people.nameLabel);
  }
  async function create() {
    fireEvent.click(
      await screen.findByRole('link', {
        name: people.addPersonAction,
      }),
    );
    await screen.findByLabelText(people.nameLabel);
  }
  function fillBirthday(year = '') {
    const summary = screen.getByText(people.birthdayLabel, {
      selector: 'summary',
    });
    fireEvent.click(summary);
    fireEvent.change(screen.getByLabelText(people.birthdayDayLabel), {
      target: { value: '29' },
    });
    fireEvent.change(screen.getByLabelText(people.birthdayMonthLabel), {
      target: { value: '2' },
    });
    if (year)
      fireEvent.change(screen.getByLabelText(people.optionalYear), {
        target: { value: year },
      });
  }
  async function save() {
    const form = screen
      .getByRole('button', { name: people.saveChanges })
      .closest('form');
    if (!form) throw new Error('Person save form is missing');
    fireEvent.submit(form);
  }

  it('shows portrait destinations without nested cards, audience copy or unrelated dates', async () => {
    const { container, api } = fixture();
    await screen.findByRole('link', { name: /^Lisa/ });
    expect(container.querySelector('.people-portrait-list')).not.toBeNull();
    expect(container.querySelector('.story-surface')).toBeNull();
    expect(screen.queryByText(people.visibility.SHARED)).toBeNull();
    expect(screen.queryByText(people.visibility.PRIVATE)).toBeNull();
    expect(
      api.listImportantDatesApiV1SpacesSpaceIdImportantDatesGet,
    ).not.toHaveBeenCalled();
  });
  it('opens a reader before editing and preserves the birthday source link', async () => {
    fixture();
    await openProfile();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
      screen.getByRole('link', { name: /12.*Mai.*1995/ }).getAttribute('href'),
    ).toBe('/plan#dates');
    expect(screen.queryByRole('button', { name: people.delete })).toBeNull();
  });
  it('supports a direct profile URL with authoritative retrieval', async () => {
    const { api } = fixture([person], '/more/people/person-1');
    await screen.findByRole('heading', { name: 'Lisa' });
    expect(
      api.getRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGet,
    ).toHaveBeenCalledWith({ personId: 'person-1', spaceId: 'space-1' });
  });
  it('creates in a focused page without an audience field or automatic text focus', async () => {
    fixture();
    await create();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText(people.visibilityLabel)).toBeNull();
    expect(document.activeElement).not.toBe(
      screen.getByLabelText(people.nameLabel),
    );
  });
  it('saves an unknown-year leap birthday as shared and opens the actual created person', async () => {
    const { api } = fixture();
    await create();
    fireEvent.change(screen.getByLabelText(people.nameLabel), {
      target: { value: 'New person' },
    });
    fillBirthday();
    await save();
    await screen.findByRole('heading', { name: 'New person' });
    const fields =
      api.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost.mock
        .calls[0][0].relatedPersonFields;
    expect(fields.visibility).toBe(ContentVisibility.SHARED);
    expect(fields.birthdayYearKnown).toBe(false);
    expect((fields.birthday as Date).toISOString().slice(5, 10)).toBe('02-29');
    expect(screen.queryByLabelText(people.nameLabel)).toBeNull();
  });
  it('preserves a known optional birth year', async () => {
    const { api } = fixture();
    await openProfile();
    await editProfile();
    await save();
    await screen.findByRole('heading', { name: 'Lisa' });
    const fields =
      api.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut.mock
        .calls[0][0].relatedPersonFields;
    expect(fields.birthdayYearKnown).toBe(true);
    expect((fields.birthday as Date).toISOString().slice(0, 10)).toBe(
      '1995-05-12',
    );
  });

  it('saves a concrete relationship and a plain-text note in the actual profile', async () => {
    const { api } = fixture();
    await create();
    fireEvent.change(screen.getByLabelText(people.nameLabel), {
      target: { value: 'Emma' },
    });
    fireEvent.change(screen.getByLabelText(people.relationshipLabel), {
      target: { value: PersonRelationship.DAUGHTER },
    });
    const note = '<b>Likes the sea.</b>\nRemember the cake.';
    fireEvent.change(screen.getByLabelText(people.noteLabel), {
      target: { value: note },
    });
    await save();
    await screen.findByRole('heading', { name: 'Emma' });
    expect(screen.getByText(people.relationship.DAUGHTER)).toBeDefined();
    const reader = screen.getByRole('heading', {
      name: people.noteTitle,
    }).parentElement;
    expect(reader?.textContent).toContain(note);
    expect(reader?.querySelector('b')).toBeNull();
    expect(
      api.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost.mock
        .calls[0][0].relatedPersonFields,
    ).toMatchObject({ note, relationship: PersonRelationship.DAUGHTER });
    await editProfile();
    expect(
      (screen.getByLabelText(people.noteLabel) as HTMLTextAreaElement).value,
    ).toBe(note);
  });

  it('retains a legacy relationship and guards a note-only dirty draft', async () => {
    const legacy = { ...person, relationship: PersonRelationship.SIBLING };
    fixture([legacy]);
    await openProfile();
    await editProfile();
    expect(
      (screen.getByLabelText(people.relationshipLabel) as HTMLSelectElement)
        .value,
    ).toBe(PersonRelationship.SIBLING);
    fireEvent.change(screen.getByLabelText(people.noteLabel), {
      target: { value: 'A note-only change' },
    });
    fireEvent.click(screen.getByRole('button', { name: taskBoundary.back }));
    expect(screen.getByText(people.discardTitle)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: people.keepEditing }));
    expect(
      (screen.getByLabelText(people.noteLabel) as HTMLTextAreaElement).value,
    ).toBe('A note-only change');
  });
  it('keeps dashboard opt-in conditional and persists deliberate enabling', async () => {
    const { api } = fixture();
    await create();
    expect(screen.queryByLabelText(people.birthdayShowOnDashboard)).toBeNull();
    fireEvent.change(screen.getByLabelText(people.nameLabel), {
      target: { value: 'Birthday person' },
    });
    fillBirthday('2000');
    fireEvent.click(screen.getByLabelText(people.birthdayShowOnDashboard));
    await save();
    await screen.findByRole('heading', { name: 'Birthday person' });
    expect(
      api.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost.mock
        .calls[0][0].relatedPersonFields.showBirthdayOnDashboard,
    ).toBe(true);
  });
  it('allows either member to edit existing dashboard preferences without changing the name', async () => {
    const { api } = fixture([{ ...person, showBirthdayOnDashboard: true }]);
    await openProfile();
    await editProfile();
    const toggle = screen.getByLabelText(
      people.birthdayShowOnDashboard,
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await save();
    await screen.findByRole('heading', { name: 'Lisa' });
    expect(
      api.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut.mock
        .calls[0][0].relatedPersonFields.showBirthdayOnDashboard,
    ).toBe(false);
  });
  it('protects a dirty Escape and lets the user keep or discard input', async () => {
    fixture();
    await create();
    fireEvent.change(screen.getByLabelText(people.nameLabel), {
      target: { value: 'Draft' },
    });
    fireEvent.keyDown(
      screen.getByRole('region', { name: people.formRailAria }),
      { key: 'Escape' },
    );
    expect(screen.getByText(people.discardTitle)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: people.keepEditing }));
    expect(
      (screen.getByLabelText(people.nameLabel) as HTMLInputElement).value,
    ).toBe('Draft');
    fireEvent.keyDown(
      screen.getByRole('region', { name: people.formRailAria }),
      { key: 'Escape' },
    );
    fireEvent.click(
      screen.getByRole('button', { name: people.discardConfirm }),
    );
    await screen.findByRole('heading', { name: people.title });
  });
  it('preserves long names in the focused editor', async () => {
    const name =
      'Alexandra Maximiliane Example-Surname With An Exceptionally Long Display Name';
    fixture([{ ...person, displayName: name }]);
    await openProfile(name);
    await editProfile();
    expect(
      (screen.getByLabelText(people.nameLabel) as HTMLInputElement).value,
    ).toBe(name);
  });
  it('retains a failed save draft and never creates a replacement person', async () => {
    const { api } = fixture();
    await openProfile();
    await editProfile();
    api.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut.mockRejectedValueOnce(
      new Error('Temporary save failure'),
    );
    fireEvent.change(screen.getByLabelText(people.nameLabel), {
      target: { value: 'Retained name' },
    });
    fireEvent.change(screen.getByLabelText(people.noteLabel), {
      target: { value: 'Retained note' },
    });
    await save();
    await waitFor(() =>
      expect(
        api.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut,
      ).toHaveBeenCalledTimes(1),
    );
    expect(
      (screen.getByLabelText(people.nameLabel) as HTMLInputElement).value,
    ).toBe('Retained name');
    expect(
      (screen.getByLabelText(people.noteLabel) as HTMLTextAreaElement).value,
    ).toBe('Retained note');
    expect(
      api.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost,
    ).not.toHaveBeenCalled();
  });
  it('keeps destructive policy and its second confirmation outside the editor', async () => {
    const { api } = fixture();
    await openProfile();
    fireEvent.click(screen.getByRole('button', { name: people.moreActions }));
    fireEvent.click(
      await screen.findByRole('button', { name: people.lifecycleTitle }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: people.deleteTitle,
    });
    expect(
      within(dialog)
        .getByRole('button', { name: people.deleteConfirm })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(
      within(dialog).getByLabelText(new RegExp(people.deleteCascadeTitle)),
    );
    expect(
      within(dialog)
        .getByRole('button', { name: people.deleteConfirm })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      api.deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete,
    ).not.toHaveBeenCalled();
  });
  for (const [removeId, expected] of [
    ['b', 'c'],
    ['c', 'b'],
    ['only', 'create'],
  ] as const) {
    it(`restores focus after removing ${removeId}`, async () => {
      const rows =
        removeId === 'only'
          ? [relatedPerson('only', 'Only')]
          : [
              relatedPerson('a', 'Alpha'),
              relatedPerson('b', 'Beta'),
              relatedPerson('c', 'Charlie'),
            ];
      fixture(rows);
      await openProfile(rows.find((p) => p.id === removeId)?.displayName);
      fireEvent.click(screen.getByRole('button', { name: people.moreActions }));
      fireEvent.click(
        await screen.findByRole('button', { name: people.lifecycleTitle }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: people.deleteTitle,
      });
      fireEvent.click(
        within(dialog).getByLabelText(new RegExp(people.deletePreserveTitle)),
      );
      fireEvent.click(
        within(dialog).getByRole('button', { name: people.deleteConfirm }),
      );
      await screen.findByRole('heading', { name: people.title });
      await waitFor(() => {
        const target =
          expected === 'create'
            ? document.getElementById('people-add-person')
            : document.querySelector(`[data-person-link="${expected}"]`);
        expect(document.activeElement).toBe(target);
      });
    });
  }
});
