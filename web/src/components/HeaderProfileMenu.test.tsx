// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import navigation from '../i18n/locales/navigation';
import { HeaderProfileMenu } from './HeaderProfileMenu';

function renderMenu(onLogout = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['profile-identity', 'space-1', 'account-1'], {
    accountId: 'account-1',
    displayName: 'Alex Example',
    profileAttachmentId: null,
    version: 1,
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <div>
          <button type="button" data-testid="outside-button">
            Outside
          </button>
          <HeaderProfileMenu
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            account={{ id: 'account-1', displayName: 'Alex Example' }}
            spaceId="space-1"
            serverAdmin={true}
            onLogout={onLogout}
          />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...result, onLogout };
}

describe('HeaderProfileMenu', () => {
  it('opens on trigger click and closes on outside click', () => {
    renderMenu();
    const trigger = screen.getByRole('button', {
      name: navigation.profileMenu,
    });
    const outside = screen.getByTestId('outside-button');

    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    // Click trigger to open
    act(() => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // Click outside to dismiss
    act(() => {
      fireEvent.pointerDown(outside);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('stays open when clicking inside the panel', () => {
    renderMenu();
    const trigger = screen.getByRole('button', {
      name: navigation.profileMenu,
    });

    act(() => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const panel = trigger.parentElement?.querySelector(
      '.header-profile-popover',
    );
    expect(panel).not.toBeNull();
    if (!panel) throw new Error('panel not found');

    act(() => {
      fireEvent.pointerDown(panel);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on Escape key and restores focus to trigger', () => {
    renderMenu();
    const trigger = screen.getByRole('button', {
      name: navigation.profileMenu,
    });

    act(() => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('calls onLogout and closes when logout button is clicked', () => {
    const onLogout = vi.fn();
    renderMenu(onLogout);
    const trigger = screen.getByRole('button', {
      name: navigation.profileMenu,
    });

    act(() => {
      fireEvent.click(trigger);
    });

    const logoutBtn = screen.getByRole('button', { name: navigation.logout });
    act(() => {
      fireEvent.click(logoutBtn);
    });

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders trigger with shell-utility-link and header-profile-trigger classes for consistent sizing and centering', () => {
    renderMenu();
    const trigger = screen.getByRole('button', {
      name: navigation.profileMenu,
    });
    expect(trigger.classList.contains('shell-utility-link')).toBe(true);
    expect(trigger.classList.contains('header-profile-trigger')).toBe(true);
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    const avatar = trigger.querySelector('.person-identity-avatar');
    expect(avatar).not.toBeNull();
  });
});
