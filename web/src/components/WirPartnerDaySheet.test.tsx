// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it } from 'vitest';
import '../i18n';
import wirCheckIn from '../i18n/locales/wirCheckIn';
import { WirPartnerDaySheet } from './WirPartnerDaySheet';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

it('opens the partner-day block from the partner avatar without quick actions', () => {
  render(
    <WirPartnerDaySheet
      partnerName="Alex"
      block={<p data-testid="partner-day-block">partner day</p>}
    >
      {(action) => (
        <button
          type="button"
          ref={action.ref}
          aria-label={action.label}
          aria-expanded={action.expanded}
          aria-haspopup={action.hasPopup}
          onClick={action.onActivate}
        />
      )}
    </WirPartnerDaySheet>,
  );

  const trigger = screen.getByRole('button', { name: 'Alex' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(
    screen.getByRole('dialog', {
      name: wirCheckIn.partnerSheetTitle.replace('{{name}}', 'Alex'),
    }),
  ).not.toBeNull();
  expect(screen.getByTestId('partner-day-block')).not.toBeNull();
});
