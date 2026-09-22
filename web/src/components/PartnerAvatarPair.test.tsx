import '../i18n';
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import { PartnerAvatarPair } from './PartnerAvatarPair';

describe('PartnerAvatarPair', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders both primary and secondary avatars with initials when images are missing', () => {
    render(
      <PartnerAvatarPair
        primaryPerson={{ displayName: 'Philipp Meier' }}
        secondaryPerson={{ displayName: 'Lea Schmidt' }}
        size="medium"
        status="active"
      />,
    );

    const expectedLabel = relationshipComponents.partnerAvatarConnected
      .replace('{{user}}', 'Philipp Meier')
      .replace('{{partner}}', 'Lea Schmidt');
    const group = screen.getByLabelText(expectedLabel);
    expect(group).toBeDefined();
    expect(screen.getByText('PM')).toBeDefined();
    expect(screen.getByText('LS')).toBeDefined();
    expect(group.className).toContain('status-active');
    expect(group.className).toContain('partner-avatar-pair-medium');
  });

  it('renders images when imageUrl is provided', () => {
    render(
      <PartnerAvatarPair
        primaryPerson={{
          displayName: 'Philipp',
          imageUrl: '/photos/philipp.jpg',
        }}
        secondaryPerson={{ displayName: 'Lea', imageUrl: '/photos/lea.jpg' }}
        size="large"
      />,
    );

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('/photos/philipp.jpg');
    expect(images[1].getAttribute('src')).toBe('/photos/lea.jpg');
  });

  it('shows the online pip only for active presence', () => {
    const { rerender } = render(
      <PartnerAvatarPair
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        status="active"
      />,
    );
    expect(document.querySelector('.partner-presence-pip')).not.toBeNull();

    rerender(
      <PartnerAvatarPair
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        status="recent"
      />,
    );
    expect(document.querySelector('.partner-presence-pip')).toBeNull();
  });

  it('attaches quiet presence state to the secondary partner avatar', () => {
    const activeCopy = relationshipComponents.couplePresencePartnerActive.replace(
      '{{name}}',
      'Lea',
    );
    const recentCopy = relationshipComponents.couplePresencePartnerRecent.replace(
      '{{name}}',
      'Lea',
    );
    const { rerender } = render(
      <PartnerAvatarPair
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        status="active"
        statusLabel={activeCopy}
      />,
    );

    expect(
      screen.getByLabelText(
        relationshipComponents.partnerAvatarConnected
          .replace('{{user}}', 'Philipp')
          .replace('{{partner}}', 'Lea') + `. ${activeCopy}`,
      ),
    ).toBeDefined();
    expect(
      document.querySelector('.partner-presence-avatar-state.status-active'),
    ).not.toBeNull();
    expect(document.querySelector('.partner-presence-badge')).toBeNull();

    rerender(
      <PartnerAvatarPair
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={{ displayName: 'Lea' }}
        status="recent"
        statusLabel={recentCopy}
      />,
    );

    expect(
      document.querySelector('.partner-presence-avatar-state.status-recent'),
    ).not.toBeNull();
    expect(document.querySelector('.partner-presence-pip')).toBeNull();
  });

  it('renders waiting state with invite button when secondaryPerson is null', () => {
    const handleInvite = vi.fn();
    render(
      <PartnerAvatarPair
        primaryPerson={{ displayName: 'Philipp' }}
        secondaryPerson={null}
        status="waiting"
        onInviteClick={handleInvite}
      />,
    );

    const expectedLabel = relationshipComponents.partnerAvatarWaiting.replace(
      '{{user}}',
      'Philipp',
    );
    const group = screen.getByLabelText(expectedLabel);
    expect(group).toBeDefined();

    const inviteButton = screen.getByRole('button', {
      name: relationshipComponents.partnerAvatarInvite,
    });
    expect(inviteButton).toBeDefined();
    expect(inviteButton.className).toContain('partner-avatar-waiting');

    fireEvent.click(inviteButton);
    expect(handleInvite).toHaveBeenCalledTimes(1);
  });

  it('falls back to initials if an image fails to load', () => {
    render(
      <PartnerAvatarPair
        primaryPerson={{
          displayName: 'Philipp Meier',
          imageUrl: '/broken.jpg',
        }}
        secondaryPerson={null}
      />,
    );

    const img = screen.getByRole('img');
    fireEvent.error(img);

    expect(screen.getByText('PM')).toBeDefined();
  });
});
