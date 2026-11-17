// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeartEmotion } from '../api/generated/models/HeartEmotion';
import {
  KeepsakeEnvelope,
  KeepsakeNoteSlip,
  KeepsakePrint,
  KeepsakeStamp,
  keepsakeTilt,
} from './DiscoverKeepsakes';

afterEach(() => {
  cleanup();
});

const base = {
  dateTime: '2026-08-24',
  dateLabel: '24. Aug. 2026',
};

describe('DiscoverKeepsakes', () => {
  it('renders a photo print as one named link with tape, photo and caption', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <KeepsakePrint
          {...base}
          to="/story/memories/mem-1"
          kindLabel="Erinnerung"
          title="Ein Wochenende am Wasser"
          tilt={keepsakeTilt(0)}
          media={<img alt="" src="data:," />}
          mediaShape="portrait"
          onOpen={onOpen}
        />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', {
      name: 'Erinnerung: Ein Wochenende am Wasser, 24. Aug. 2026',
    });
    expect(link.getAttribute('href')).toBe('/story/memories/mem-1');
    expect(link.getAttribute('data-keepsake')).toBe('print');
    expect(link.getAttribute('data-keepsake-shape')).toBe('portrait');
    expect(link.style.getPropertyValue('--keepsake-tilt')).toBe('-1.4deg');
    expect(container.querySelector('.momente-keepsake-tape')).not.toBeNull();
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-08-24',
    );
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith(
      expect.anything(),
      '/story/memories/mem-1',
    );
  });

  it('renders a milestone stamp and a note slip with meaningful names', () => {
    render(
      <MemoryRouter>
        <KeepsakeStamp
          {...base}
          to="/story/milestones/ms-1"
          kindLabel="Meilenstein"
          title="Ein Jahr in unserer Wohnung"
        />
        <KeepsakeNoteSlip
          {...base}
          to="/story/memories/mem-2"
          kindLabel="Erinnerung"
          title="Kochabend"
          excerpt="Noch zwei Tage später hat die Küche danach gerochen."
        />
      </MemoryRouter>,
    );
    expect(
      screen
        .getByRole('link', {
          name: 'Meilenstein: Ein Jahr in unserer Wohnung, 24. Aug. 2026',
        })
        .getAttribute('data-keepsake'),
    ).toBe('stamp');
    const slip = screen.getByRole('link', {
      name: 'Erinnerung: Kochabend, 24. Aug. 2026',
    });
    expect(slip.getAttribute('data-keepsake')).toBe('slip');
    expect(slip.textContent).toContain('Noch zwei Tage später');
  });

  it('opens a Heart Moment envelope as a disclosure with a separate full link', () => {
    render(
      <MemoryRouter>
        <KeepsakeEnvelope
          {...base}
          to="/story/heart-moments/hm-1"
          kindLabel="Herzmoment"
          authorName="Alex"
          emotion={HeartEmotion.LOVED}
          text="Danke, dass du heute einfach zugehört hast."
        />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole('button', {
      name: /^Herzmoment von Alex, .+, 24\. Aug\. 2026$/,
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Von Alex')).not.toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    const letter = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    );
    expect(letter?.hidden).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(letter?.hidden).toBe(false);
    expect(
      screen.getByText('Danke, dass du heute einfach zugehört hast.'),
    ).not.toBeNull();
    const full = screen.getByRole('link', { name: 'Ganz ansehen' });
    expect(full.getAttribute('href')).toBe('/story/heart-moments/hm-1');
    expect(
      toggle.closest('[data-keepsake="envelope"]')?.getAttribute('data-open'),
    ).toBe('true');
    expect(
      toggle
        .closest('[data-keepsake="envelope"]')
        ?.getAttribute('data-heart-emotion'),
    ).toBe('LOVED');
  });

  it('keeps tilts deterministic and within the album range', () => {
    const tilts = Array.from({ length: 24 }, (_, index) => keepsakeTilt(index));
    expect(tilts).toEqual(
      Array.from({ length: 24 }, (_, index) => keepsakeTilt(index)),
    );
    for (const tilt of tilts) {
      expect(tilt).toBeGreaterThanOrEqual(-2.4);
      expect(tilt).toBeLessThanOrEqual(2);
    }
    expect(new Set(tilts.slice(0, 2)).size).toBe(2);
  });
});
