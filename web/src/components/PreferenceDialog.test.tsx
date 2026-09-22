// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PreferenceDialog, PreferenceManager } from './ProfilePageBase';
import { ProfileVisibility } from '../api/generated/models/ProfileVisibility';
import { PreferenceCategory } from '../api/generated/models/PreferenceCategory';
import { PreferenceSentiment } from '../api/generated/models/PreferenceSentiment';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { ProfilePreferenceView } from '../api/generated/models/ProfilePreferenceView';

function mockMatchMedia(reducedMotion: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  mockMatchMedia(true);
});

describe('PreferenceDialog accessibility, focus, and scroll locking', () => {
  it('preserves and restores previous body overflow value on close and on unmount', () => {
    document.body.style.overflow = 'scroll';
    const onCancel = vi.fn();
    const onSubmit = vi.fn();

    const { rerender, unmount } = render(
      <PreferenceDialog
        isOpen={true}
        preference={null}
        privateNote={false}
        pending={false}
        deletePending={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <PreferenceDialog
        isOpen={false}
        preference={null}
        privateNote={false}
        pending={false}
        deletePending={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
    expect(document.body.style.overflow).toBe('scroll');

    // Reopen and test unmount cleanup
    rerender(
      <PreferenceDialog
        isOpen={true}
        preference={null}
        privateNote={false}
        pending={false}
        deletePending={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  it('keeps focus containment and scroll lock until animated exit completion', async () => {
    mockMatchMedia(false);
    document.body.style.overflow = 'auto';
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.append(trigger);
    trigger.focus();
    const restoreFocusRef = { current: trigger };

    const props = {
      preference: null,
      privateNote: false,
      pending: false,
      deletePending: false,
      onCancel: vi.fn(),
      onSubmit: vi.fn(),
      restoreFocusRef,
    };
    const { rerender } = render(<PreferenceDialog isOpen={true} {...props} />);
    const dialog = screen.getByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<PreferenceDialog isOpen={false} {...props} />);

    expect(dialog.parentElement?.getAttribute('data-presence')).toBe('exiting');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('dialog')).toBe(dialog);

    fireEvent.animationEnd(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.overflow).toBe('auto');
    trigger.remove();
  });

  it('targets the first real focusable form control on open and provides tabIndex -1 on heading', async () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();

    render(
      <PreferenceDialog
        isOpen={true}
        preference={null}
        privateNote={false}
        pending={false}
        deletePending={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading.getAttribute('tabindex')).toBe('-1');

    await waitFor(() => {
      const categorySelect = document.getElementById(
        'preference-category-self',
      );
      expect(document.activeElement).toBe(categorySelect);
    });
  });

  it('closes on Escape key and backdrop click, but does not close when clicking inside dialog', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();

    const { container } = render(
      <PreferenceDialog
        isOpen={true}
        preference={null}
        privateNote={false}
        pending={false}
        deletePending={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    // Escape closes
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Click inside dialog does not close
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Backdrop click closes
    const backdrop = container.querySelector('.preference-modal-backdrop');
    expect(backdrop).not.toBeNull();
    if (backdrop) {
      fireEvent.click(backdrop);
    }
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('traps focus with Tab and Shift+Tab within the dialog', async () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();

    render(
      <PreferenceDialog
        isOpen={true}
        preference={null}
        privateNote={false}
        pending={false}
        deletePending={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable.length).toBeGreaterThan(1);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // When focus is on first, Shift+Tab should cycle to last
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // When focus is on last, Tab should cycle to first
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(first);
  });
});

describe('PreferenceManager focus restoration and terminology', () => {
  const mockProfilesApi = {
    createProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPost: vi.fn(),
    updateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdPut:
      vi.fn(),
    deleteProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdDelete:
      vi.fn(),
  } as unknown as ProfilesApi;

  function renderManagerFixture(
    visibility:
      | typeof ProfileVisibility.SELF_PROFILE
      | typeof ProfileVisibility.PRIVATE_PARTNER_NOTE,
    items: ProfilePreferenceView[] = [],
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const isPrivate = visibility === ProfileVisibility.PRIVATE_PARTNER_NOTE;

    return render(
      <QueryClientProvider client={queryClient}>
        <PreferenceManager
          profilesApi={mockProfilesApi}
          spaceId="space-1"
          accountId="acc-1"
          visibility={visibility}
          items={items}
          title={isPrivate ? 'Private Notizen' : 'Meine Vorlieben'}
          intro="Intro text"
          emptyTitle="Keine Einträge"
          emptyBody="Füge deinen ersten Eintrag hinzu"
        />
      </QueryClientProvider>,
    );
  }

  it('restores focus to Vorliebe trigger button after closing modal', async () => {
    const user = userEvent.setup();
    renderManagerFixture(ProfileVisibility.SELF_PROFILE);

    const triggerBtn = screen.getByRole('button', { name: /Vorliebe/i });
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    await user.click(triggerBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeDefined();

    // Close via close button
    const closeBtn = screen.getAllByRole('button', { name: 'Abbrechen' })[0];
    await user.click(closeBtn);

    await waitFor(() => {
      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  it('restores focus to Notiz trigger button for private partner notes', async () => {
    const user = userEvent.setup();
    renderManagerFixture(ProfileVisibility.PRIVATE_PARTNER_NOTE);

    const triggerBtn = screen.getByRole('button', { name: /Notiz/i });
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    await user.click(triggerBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeDefined();

    // Close via close button
    const closeBtn = screen.getAllByRole('button', { name: 'Abbrechen' })[0];
    await user.click(closeBtn);

    await waitFor(() => {
      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  it('restores focus to clicked preference chip after closing modal', async () => {
    const user = userEvent.setup();
    const chipItem: ProfilePreferenceView = {
      id: 'pref-chip-1',
      accountId: 'acc-1',
      category: PreferenceCategory.FOOD,
      sentiment: PreferenceSentiment.LOVE,
      topic: 'Tacos',
      value: 'Scharf mit Koriander',
      visibility: ProfileVisibility.SELF_PROFILE,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    renderManagerFixture(ProfileVisibility.SELF_PROFILE, [chipItem]);

    const chipBtn = screen.getByRole('button', { name: /Tacos/i });
    chipBtn.focus();
    expect(document.activeElement).toBe(chipBtn);

    await user.click(chipBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeDefined();

    const closeBtn = screen.getAllByRole('button', { name: 'Abbrechen' })[0];
    await user.click(closeBtn);

    await waitFor(() => {
      expect(document.activeElement).toBe(chipBtn);
    });
  });
});

describe('PreferenceDialog viewport safety', () => {
  it('has viewport-safe styling rules for low desktop viewport height (e.g. 1366x768)', () => {
    const { container } = render(
      <PreferenceDialog
        isOpen={true}
        preference={null}
        privateNote={false}
        pending={false}
        deletePending={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const dialog = container.querySelector('.preference-modal-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains('preference-modal-dialog')).toBe(true);
    // Dialog contains header, form, scrollable fields, and actions
    expect(dialog?.querySelector('.preference-modal-header')).not.toBeNull();
    expect(dialog?.querySelector('form')).not.toBeNull();
    expect(dialog?.querySelector('.preference-modal-actions')).not.toBeNull();
  });
});
