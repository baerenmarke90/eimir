// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import serverAdmin from '../i18n/locales/serverAdmin';
import {
  ServerAdminAreaNavigation,
  ServerAdminSubNavigation,
} from './ServerAdminAreaNavigation';
import { resolveServerAdminSection } from './ServerAdminPage';

/** Shows the current query string so a test can see whether navigation happened. */
function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}

function markup(node: React.ReactNode): string {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

function currentLinks(html: string): string[] {
  return [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)].map(
    ([tag]) => tag,
  );
}

describe('ServerAdmin area navigation', () => {
  it('keeps resolving old section ids', () => {
    expect(resolveServerAdminSection(null)).toBe('overview');
    expect(resolveServerAdminSection('unknown')).toBe('overview');
    expect(resolveServerAdminSection('activity')).toBe('activity');
  });

  it('renders four areas without the plugin and marks People for spaces', () => {
    const html = markup(
      <ServerAdminAreaNavigation
        activeSection="spaces"
        supportReportsAvailable={false}
        supportReportsNew={0}
      />,
    );

    expect(html).toContain('href="/server-admin"');
    expect(html).toContain('href="/server-admin?section=search"');
    expect(html).toContain('href="/server-admin?section=monitoring"');
    expect(html).not.toContain('section=reports');
    // The Compact bar and the Expanded list each mark People as current.
    const current = currentLinks(html);
    expect(current).toHaveLength(2);
    for (const tag of current) expect(tag).toContain('section=search');
  });

  it('adds Help with the unread badge when the plugin is available', () => {
    render(
      <MemoryRouter>
        <ServerAdminAreaNavigation
          activeSection="overview"
          supportReportsAvailable
          supportReportsNew={3}
        />
      </MemoryRouter>,
    );
    const name = serverAdmin.areas.helpUnread_other.replace(
      '{{count, number}}',
      '3',
    );
    expect(screen.getAllByRole('link', { name })).toHaveLength(2);
    cleanup();
  });

  it('keeps deep links: activity opens inside System', () => {
    const areas = markup(
      <ServerAdminAreaNavigation
        activeSection="activity"
        supportReportsAvailable={false}
        supportReportsNew={0}
      />,
    );
    for (const tag of currentLinks(areas)) {
      expect(tag).toContain('section=monitoring');
    }
    const pages = markup(<ServerAdminSubNavigation activeSection="activity" />);
    const [current] = currentLinks(pages);
    expect(current).toContain('section=activity');
  });

  it('shows no sub-navigation for single-page areas', () => {
    expect(markup(<ServerAdminSubNavigation activeSection="overview" />)).toBe(
      '',
    );
  });

  it('shows the Help pages as sub-navigation', () => {
    const pages = markup(<ServerAdminSubNavigation activeSection="reports" />);
    expect(pages).toContain('section=replyTemplates');
    expect(pages).toContain(serverAdmin.navigation.replyTemplates);
    const [current] = currentLinks(pages);
    expect(current).not.toContain('section=replyTemplates');
  });

  describe('leaving the reports section with an unsent draft', () => {
    afterEach(() => cleanup());

    function renderNavigation(confirmLeave: () => boolean) {
      render(
        <MemoryRouter initialEntries={['/server-admin?section=reports']}>
          <ServerAdminAreaNavigation
            activeSection="reports"
            supportReportsAvailable
            supportReportsNew={0}
            confirmLeave={confirmLeave}
          />
          <Location />
        </MemoryRouter>,
      );
    }

    it('stays when the operator keeps the draft', () => {
      const confirmLeave = vi.fn(() => false);
      renderNavigation(confirmLeave);
      fireEvent.click(
        screen.getAllByRole('link', { name: serverAdmin.areas.people })[0],
      );
      expect(confirmLeave).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('location').textContent).toBe(
        '?section=reports',
      );
    });

    it('leaves when the operator discards the draft', () => {
      renderNavigation(() => true);
      fireEvent.click(
        screen.getAllByRole('link', { name: serverAdmin.areas.people })[0],
      );
      expect(screen.getByTestId('location').textContent).toBe(
        '?section=search',
      );
    });
  });
});
