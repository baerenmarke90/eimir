// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import { MembershipStatus } from '../api/generated/models/MembershipStatus';
import spaceOffboarding from '../i18n/locales/spaceOffboarding';
import { SpaceOffboardingPanel } from './SpaceOffboardingPanel';

function renderPanel({
  demoMode = false,
  onSpaceLeft = vi.fn(),
}: {
  demoMode?: boolean;
  onSpaceLeft?: () => void | Promise<void>;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const spacesApi = Object.create(SpacesApi.prototype) as SpacesApi;

  render(
    <QueryClientProvider client={queryClient}>
      <SpaceOffboardingPanel
        spacesApi={spacesApi}
        spaceId="space-a"
        demoMode={demoMode}
        onSpaceLeft={onSpaceLeft}
      />
    </QueryClientProvider>,
  );

  return { onSpaceLeft };
}

function advanceToFinalConfirmation() {
  fireEvent.click(
    screen.getByRole('button', { name: spaceOffboarding.action }),
  );
  expect(screen.getByRole('dialog')).toBeDefined();
  expect(screen.getByText(spaceOffboarding.consequencesTitle)).toBeDefined();

  fireEvent.click(
    screen.getByRole('button', { name: spaceOffboarding.continueAction }),
  );
  expect(screen.getByText(spaceOffboarding.finalTitle)).toBeDefined();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SpaceOffboardingPanel', () => {
  it('closes on system Back and releases its history entry (#1907)', async () => {
    renderPanel();
    fireEvent.click(
      screen.getByRole('button', { name: spaceOffboarding.action }),
    );
    await waitFor(() =>
      expect(window.history.state?.__eimirEditorEntry).toBeTruthy(),
    );
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(
      screen.getByRole('button', { name: spaceOffboarding.action }),
    );
    await waitFor(() =>
      expect(window.history.state?.__eimirEditorEntry).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: spaceOffboarding.cancelAction }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps self-service Space exit unavailable in Demo mode', () => {
    const leaveSpy = vi.spyOn(
      SpacesApi.prototype,
      'leaveSpaceApiV1SpacesSpaceIdMembershipLeavePost',
    );
    renderPanel({ demoMode: true });

    expect(screen.getByText(spaceOffboarding.demoTitle)).toBeDefined();
    const leaveButton = screen.getByRole('button', {
      name: spaceOffboarding.action,
    }) as HTMLButtonElement;
    expect(leaveButton.disabled).toBe(true);
    fireEvent.click(leaveButton);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(leaveSpy).not.toHaveBeenCalled();
  });

  it('requires consequence review and exact confirmation before using the generated Spaces API', async () => {
    const leaveSpy = vi
      .spyOn(
        SpacesApi.prototype,
        'leaveSpaceApiV1SpacesSpaceIdMembershipLeavePost',
      )
      .mockResolvedValue({
        endedAt: new Date('2026-09-05T00:00:00Z'),
        spaceId: 'space-a',
        status: MembershipStatus.LEFT,
      });
    const onSpaceLeft = vi.fn();
    renderPanel({ onSpaceLeft });

    advanceToFinalConfirmation();

    const submit = screen.getByRole('button', {
      name: spaceOffboarding.submitAction,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(spaceOffboarding.confirmLabel), {
      target: { value: 'WRONG' },
    });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(spaceOffboarding.confirmLabel), {
      target: { value: spaceOffboarding.confirmPhrase },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(leaveSpy).toHaveBeenCalledWith({ spaceId: 'space-a' });
      expect(onSpaceLeft).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the confirmation flow and active host context when the server rejects exit', async () => {
    vi.spyOn(
      SpacesApi.prototype,
      'leaveSpaceApiV1SpacesSpaceIdMembershipLeavePost',
    ).mockRejectedValue({ status: 503 });
    const onSpaceLeft = vi.fn();
    renderPanel({ onSpaceLeft });

    advanceToFinalConfirmation();
    fireEvent.change(screen.getByLabelText(spaceOffboarding.confirmLabel), {
      target: { value: spaceOffboarding.confirmPhrase },
    });
    fireEvent.click(
      screen.getByRole('button', { name: spaceOffboarding.submitAction }),
    );

    await waitFor(() => {
      expect(onSpaceLeft).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(document.querySelector('.ui-state')).not.toBeNull();
    });
  });

  it('points to a copy on request instead of an export detour', () => {
    const leaveSpy = vi.spyOn(
      SpacesApi.prototype,
      'leaveSpaceApiV1SpacesSpaceIdMembershipLeavePost',
    );
    renderPanel();

    fireEvent.click(
      screen.getByRole('button', { name: spaceOffboarding.action }),
    );

    expect(screen.getByText(spaceOffboarding.consequenceExport)).toBeDefined();
    expect(
      Object.keys(spaceOffboarding).filter((key) => /^export/i.test(key)),
    ).toEqual([]);
    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.textContent)
        .filter((text) => /export/i.test(text ?? '')),
    ).toEqual([]);
    expect(leaveSpy).not.toHaveBeenCalled();
  });
});
