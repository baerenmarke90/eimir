// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import copy from '../i18n/locales/games';
import { LocalCoupleGame } from './LocalCoupleGame';
function setup(game: 'happiness' | 'timeTravel', couple = true) {
  const onExit = vi.fn();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LocalCoupleGame
          game={game}
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
describe('Finite authored couple games', () => {
  it.each(['happiness', 'timeTravel'] as const)(
    'can finish, skip, restart and exit %s without storing answers',
    async (game) => {
      const view = setup(game);
      await screen.findByText(copy.local[game].first);
      fireEvent.click(screen.getByRole('button', { name: copy.local.skip }));
      for (let index = 1; index < 6; index += 1)
        fireEvent.click(
          screen.getByRole('button', {
            name: game === 'happiness' ? copy.local.done : copy.local.next,
          }),
        );
      expect(screen.getByText(copy.local.finishTitle)).toBeTruthy();
      expect(
        screen.getByText(copy.local.finishBody_other.replace('{{count}}', '5')),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: copy.local.restart }));
      expect(screen.getByText(copy.local[game].second)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: copy.local.back }));
      expect(view.onExit).toHaveBeenCalledOnce();
      view.unmount();
    },
  );
  it('explains the two-person requirement instead of starting an invalid round', async () => {
    setup('happiness', false);
    await screen.findByText(copy.local.coupleRequiredTitle);
    expect(screen.queryByText(copy.local.happiness.first)).toBeNull();
  });
});
