import { describe, expect, it } from 'vitest';
import {
  advisoryId,
  blockingAdvisories,
  evaluateAudit,
} from './audit-gate.mjs';

const advisory = (id, severity = 'high', name = 'picomatch') => ({
  name,
  severity,
  title: `${name} advisory`,
  url: `https://github.com/advisories/${id}`,
});

const report = (...vias) => ({
  vulnerabilities: {
    picomatch: { severity: 'high', via: vias },
    // A transitive package that only names the vulnerable package.
    vite: { severity: 'high', via: ['picomatch'] },
  },
});

const allowlist = (overrides = {}) => ({
  entries: [
    {
      advisory: 'GHSA-aaaa-bbbb-cccc',
      package: 'picomatch',
      scope: 'development',
      reason: 'dev tools only, no fix published',
      expires: '2026-12-17',
      ...overrides,
    },
  ],
});

const empty = { vulnerabilities: {} };

describe('audit gate', () => {
  it('reads advisory ids and ignores package-name references', () => {
    expect(
      advisoryId('https://github.com/advisories/GHSA-aaaa-bbbb-cccc'),
    ).toBe('GHSA-AAAA-BBBB-CCCC');
    expect([
      ...blockingAdvisories(
        report(advisory('GHSA-aaaa-bbbb-cccc'), advisory('GHSA-x', 'moderate')),
      ).keys(),
    ]).toEqual(['GHSA-AAAA-BBBB-CCCC']);
  });

  it('accepts a named development-only advisory before its expiry', () => {
    const result = evaluateAudit({
      full: report(advisory('GHSA-aaaa-bbbb-cccc')),
      production: empty,
      allowlist: allowlist(),
      today: '2026-11-17',
    });
    expect(result.failures).toEqual([]);
    expect(result.notes[0]).toContain('until 2026-12-17');
  });

  it('fails on any other high advisory', () => {
    const result = evaluateAudit({
      full: report(
        advisory('GHSA-aaaa-bbbb-cccc'),
        advisory('GHSA-dddd-eeee-ffff', 'critical', 'other'),
      ),
      production: empty,
      allowlist: allowlist(),
      today: '2026-11-17',
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('GHSA-DDDD-EEEE-FFFF');
  });

  it('fails once the allowlist entry has expired', () => {
    const result = evaluateAudit({
      full: report(advisory('GHSA-aaaa-bbbb-cccc')),
      production: empty,
      allowlist: allowlist(),
      today: '2026-12-18',
    });
    expect(result.failures[0]).toContain('expired on 2026-12-17');
  });

  it('fails when an allowlisted advisory reaches the production tree', () => {
    const production = report(advisory('GHSA-aaaa-bbbb-cccc'));
    const result = evaluateAudit({
      full: production,
      production,
      allowlist: allowlist(),
      today: '2026-11-17',
    });
    expect(result.failures[0]).toContain('production tree');
  });

  it('rejects an entry without a reason or development scope', () => {
    const result = evaluateAudit({
      full: empty,
      production: empty,
      allowlist: allowlist({ reason: '', scope: 'production' }),
      today: '2026-11-17',
    });
    expect(result.failures).toHaveLength(1);
  });

  it('asks to remove an entry whose advisory is gone', () => {
    const result = evaluateAudit({
      full: empty,
      production: empty,
      allowlist: allowlist(),
      today: '2026-11-17',
    });
    expect(result.failures).toEqual([]);
    expect(result.notes[0]).toContain('remove its allowlist entry');
  });
});
