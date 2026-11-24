import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  resolveServerAdminSection,
  ServerAdminSectionNavigation,
} from './ServerAdminPage';

describe('ServerAdmin section navigation', () => {
  it('falls back to the overview for missing or unknown sections', () => {
    expect(resolveServerAdminSection(null)).toBe('overview');
    expect(resolveServerAdminSection('unknown')).toBe('overview');
    expect(resolveServerAdminSection('accounts')).toBe('accounts');
    expect(resolveServerAdminSection('spaces')).toBe('spaces');
    expect(resolveServerAdminSection('jobs')).toBe('jobs');
    expect(resolveServerAdminSection('storage')).toBe('storage');
    expect(resolveServerAdminSection('security')).toBe('security');
    expect(resolveServerAdminSection('settings')).toBe('settings');
    expect(resolveServerAdminSection('activity')).toBe('activity');
  });

  it('renders stable deep links and marks the active section', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ServerAdminSectionNavigation activeSection="accounts" />
      </MemoryRouter>,
    );

    expect(html.match(/server-admin-section-link/g)).toHaveLength(8);
    expect(html).toContain('href="/server-admin"');
    expect(html).toContain('href="/server-admin?section=accounts"');
    expect(html).toContain('href="/server-admin?section=spaces"');
    expect(html).toContain('href="/server-admin?section=jobs"');
    expect(html).toContain('href="/server-admin?section=storage"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('section=reports');
  });

  it('offers the reports section only when the operator plugin is advertised', () => {
    expect(resolveServerAdminSection('reports')).toBe('reports');
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ServerAdminSectionNavigation
          activeSection="reports"
          supportReportsAvailable
        />
      </MemoryRouter>,
    );

    expect(html.match(/server-admin-section-link/g)).toHaveLength(9);
    const reportsLink = html.match(/<a[^>]*section=reports[^>]*>/)?.[0];
    expect(reportsLink).toContain('aria-current="page"');
  });
});
