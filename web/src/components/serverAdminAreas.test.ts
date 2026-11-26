import { describe, expect, it } from 'vitest';
import {
  AREA_SECTIONS,
  areaForSection,
  resolveServerAdminSection,
  SERVER_ADMIN_SECTIONS,
  sectionHref,
  visibleAreas,
} from './serverAdminAreas';

describe('ServerAdmin areas', () => {
  it('places every section in exactly one area', () => {
    const placed = Object.values(AREA_SECTIONS).flat();
    expect([...placed].sort()).toEqual([...SERVER_ADMIN_SECTIONS].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('maps sections to their area', () => {
    expect(areaForSection('overview')).toBe('situation');
    expect(areaForSection('search')).toBe('people');
    expect(areaForSection('accounts')).toBe('people');
    expect(areaForSection('spaces')).toBe('people');
    expect(areaForSection('reports')).toBe('help');
    expect(areaForSection('replyTemplates')).toBe('help');
    expect(areaForSection('activity')).toBe('system');
    expect(areaForSection('settings')).toBe('system');
    expect(areaForSection('monitoring')).toBe('system');
  });

  it('opens Help at the reports, with the reply templates second', () => {
    expect(AREA_SECTIONS.help).toEqual(['reports', 'replyTemplates']);
  });

  it('opens People at the search', () => {
    expect(AREA_SECTIONS.people[0]).toBe('search');
  });

  it('opens System at Monitoring', () => {
    expect(AREA_SECTIONS.system[0]).toBe('monitoring');
  });

  it('shows Help only with the operator plugin', () => {
    expect(visibleAreas({ supportReportsAvailable: false })).toEqual([
      'situation',
      'people',
      'system',
    ]);
    expect(visibleAreas({ supportReportsAvailable: true })).toEqual([
      'situation',
      'people',
      'help',
      'system',
    ]);
  });

  it('builds stable links with optional parameters', () => {
    expect(sectionHref('overview')).toBe('/server-admin');
    expect(sectionHref('jobs')).toBe('/server-admin?section=jobs');
    expect(sectionHref('spaces', { space: 'x' })).toBe(
      '/server-admin?section=spaces&space=x',
    );
    expect(sectionHref('reports', { state: 'NEW' })).toBe(
      '/server-admin?section=reports&state=NEW',
    );
  });

  it('keeps resolving unknown sections to the overview', () => {
    expect(resolveServerAdminSection(null)).toBe('overview');
    expect(resolveServerAdminSection('nope')).toBe('overview');
    expect(resolveServerAdminSection('activity')).toBe('activity');
  });
});
