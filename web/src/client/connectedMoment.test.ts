// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import {
  connectedMomentState,
  markInvitationAccepted,
  resetConnectedMomentForTests,
} from './connectedMoment';

beforeEach(() => {
  localStorage.clear();
  resetConnectedMomentForTests();
});

it('plays once for the creator who saw the Space without a partner', () => {
  expect(connectedMomentState('lea', 'space', null, '2026-11-16')).toEqual({
    visible: false,
    playing: false,
  });
  expect(connectedMomentState('lea', 'space', 'alex', '2026-11-16')).toEqual({
    visible: true,
    playing: true,
  });
  // Later that day only the quiet line remains after a reload.
  resetConnectedMomentForTests();
  expect(connectedMomentState('lea', 'space', 'alex', '2026-11-16')).toEqual({
    visible: true,
    playing: false,
  });
  expect(connectedMomentState('lea', 'space', 'alex', '2026-11-17')).toEqual({
    visible: false,
    playing: false,
  });
});

it('plays once for the partner who accepted the invitation here', () => {
  markInvitationAccepted('space');
  expect(connectedMomentState('alex', 'space', 'lea', '2026-11-16')).toEqual({
    visible: true,
    playing: true,
  });
  expect(localStorage.getItem('eimir-connected-moment-v1:joined:space')).toBe(
    null,
  );
});

it('never plays for a couple that was already connected', () => {
  expect(connectedMomentState('lea', 'space', 'alex', '2026-11-16')).toEqual({
    visible: false,
    playing: false,
  });
  expect(connectedMomentState('lea', 'space', 'alex', '2026-11-16')).toEqual({
    visible: false,
    playing: false,
  });
});

it('stores opaque ids and a day only', () => {
  connectedMomentState('lea', 'space', null, '2026-11-16');
  connectedMomentState('lea', 'space', 'alex', '2026-11-16');
  expect(
    JSON.parse(
      localStorage.getItem('eimir-connected-moment-v1:lea:space') ?? '',
    ),
  ).toEqual({ partnerId: 'alex', playedOn: '2026-11-16' });
});
