// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import copy from '../i18n/locales/coupleExperiences';
import { CoupleExperiencePage } from './CoupleExperiencePage';
function setup(game: 'happiness' | 'timeTravel', couple = true) {
  const onExit = vi.fn();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CoupleExperiencePage
          kind={game}
          accountId="account"
          loadEntitlement={async () =>
            ({
              capabilities: ['games.couple'],
            }) as import('../api/generated/models/SpaceEntitlementView').SpaceEntitlementView
          }
          apiBaseUrl=""
          accessToken="test"
          spaceId="space"
          onExit={onExit}
          loadParticipants={async () =>
            couple
              ? [
                  { id: 'a', displayName: 'A' },
                  { id: 'b', displayName: 'B' },
                ]
              : null
          }
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, onExit };
}
describe('Independent finite couple experiences', () => {
  it.each(['happiness', 'timeTravel'] as const)(
    'can finish, skip, restart and exit %s without storing answers',
    async (game) => {
      const view = setup(game);
      await screen.findByText(copy.session[game].first);
      fireEvent.click(screen.getByRole('button', { name: copy.session.skip }));
      for (let index = 1; index < 6; index += 1)
        fireEvent.click(
          screen.getByRole('button', {
            name: game === 'happiness' ? copy.session.done : copy.session.next,
          }),
        );
      expect(screen.getByText(copy.session.finishTitle)).toBeTruthy();
      expect(
        screen.getByText(
          copy.session.finishBody_other.replace('{{count}}', '5'),
        ),
      ).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: copy.session.restart }),
      );
      expect(screen.getByText(copy.session[game].second)).toBeTruthy();
      for (let index = 0; index < 6; index += 1)
        fireEvent.click(
          screen.getByRole('button', { name: copy.session.skip }),
        );
      fireEvent.click(screen.getByRole('button', { name: copy.session.back }));
      expect(view.onExit).toHaveBeenCalledOnce();
      view.unmount();
    },
  );
  it('explains the two-person requirement instead of starting an invalid round', async () => {
    setup('happiness', false);
    await screen.findByText(copy.session.coupleRequiredTitle);
    expect(screen.queryByText(copy.session.happiness.first)).toBeNull();
  });
});
