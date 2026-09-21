import '../i18n';
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import { CouplePresence } from './CouplePresence';

describe('CouplePresence', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders space title, both partner avatars, and connected status', () => {
    render(
      <CouplePresence
        spaceTitle="Philipp & Lea"
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        status="active"
        relationshipDuration="3y"
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Philipp & Lea' }),
    ).toBeDefined();
    expect(
      screen.getByText(relationshipComponents.couplePresenceActive),
    ).toBeDefined();
    expect(screen.getByText('3y')).toBeDefined();
  });

  it('shows only first names throughout a connected couple hero', () => {
    render(
      <CouplePresence
        spaceTitle="Lea Winters & Alex Winter"
        primaryPerson={{ displayName: 'Lea Winters' }}
        secondaryPerson={{ displayName: 'Alex Winter' }}
        status="active"
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Lea & Alex' }),
    ).toBeDefined();
    expect(document.body.innerHTML).not.toContain('Winters');
    expect(document.body.innerHTML).not.toContain('Winter');
  });

  it('renders recent presence without an online dot and unknown without a claim', () => {
    const { rerender } = render(
      <CouplePresence
        spaceTitle="Philipp & Lea"
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        status="recent"
      />,
    );

    expect(
      screen.getByText(relationshipComponents.couplePresenceRecent),
    ).toBeDefined();
    expect(document.querySelector('.couple-presence-dot')).toBeNull();

    rerender(
      <CouplePresence
        spaceTitle="Philipp & Lea"
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        status="unknown"
      />,
    );
    expect(
      screen.queryByText(relationshipComponents.couplePresenceRecent),
    ).toBeNull();
    expect(document.querySelector('.couple-presence-indicator')).toBeNull();
  });

  it('calls onDurationClick when relationship duration button is pressed', () => {
    const handleDurationClick = vi.fn();
    render(
      <CouplePresence
        spaceTitle="Philipp & Lea"
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        relationshipDuration="500d"
        onDurationClick={handleDurationClick}
      />,
    );

    const durationButton = screen.getByRole('button', {
      name: '500d',
    });
    fireEvent.click(durationButton);
    expect(handleDurationClick).toHaveBeenCalledTimes(1);
  });

  it('renders waiting state and handles invite click', () => {
    const handleInvite = vi.fn();
    render(
      <CouplePresence
        spaceTitle="Philipp"
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={null}
        status="waiting"
        onInviteClick={handleInvite}
      />,
    );

    expect(
      screen.getByText(relationshipComponents.couplePresenceWaiting),
    ).toBeDefined();
    const inviteBtn = screen.getByRole('button', {
      name: relationshipComponents.partnerAvatarInvite,
    });
    fireEvent.click(inviteBtn);
    expect(handleInvite).toHaveBeenCalledTimes(1);
  });

  it('renders an avatar-adjacent control without changing the identity primitive', () => {
    render(
      <CouplePresence
        spaceTitle="Philipp & Lea"
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        avatarAdornment={<button type="button">Energy</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Energy' })).toBeDefined();
    expect(
      document.querySelector('.couple-presence-avatar-adornment'),
    ).not.toBeNull();
    expect(
      document.querySelector('.couple-presence-avatar-anchor.has-adornment'),
    ).not.toBeNull();
  });

  it('renders custom actions slot if provided', () => {
    render(
      <CouplePresence
        spaceTitle="Philipp & Lea"
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        actions={<button type="button">Action</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Action' })).toBeDefined();
  });
});
