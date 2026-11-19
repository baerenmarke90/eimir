import { describe, expect, it } from 'vitest';
import { planIdFromShortId, readPlanShortLinkUrl } from './planShortLink';

// Expected values come from Python's `urlsafe_b64encode(uuid.bytes)`, which
// the calendar sync uses for the event backlink.
const PLAN_ID = '0f8e5b4a-1c2d-4e3f-9a8b-7c6d5e4f3a2b';
const SHORT_ID = 'D45bShwtTj-ai3xtXk86Kw';

describe('planIdFromShortId', () => {
  it('decodes the backend short id to the plan UUID', () => {
    expect(planIdFromShortId(SHORT_ID)).toBe(PLAN_ID);
    expect(planIdFromShortId('_____________________w')).toBe(
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    );
  });

  it('rejects ids of the wrong length, alphabet or padding bits', () => {
    expect(planIdFromShortId('')).toBeNull();
    expect(planIdFromShortId(SHORT_ID.slice(1))).toBeNull();
    expect(planIdFromShortId(`${SHORT_ID}A`)).toBeNull();
    expect(planIdFromShortId('D45bShwtTj+ai3xtXk86Kw')).toBeNull();
    expect(planIdFromShortId('______________________')).toBeNull();
  });
});

describe('readPlanShortLinkUrl', () => {
  const origin = 'https://app.eimir.de';

  it('accepts a short plan link of the configured instance', () => {
    expect(readPlanShortLinkUrl(`${origin}/p/${SHORT_ID}`, origin)).toBe(
      PLAN_ID,
    );
    expect(readPlanShortLinkUrl(`${origin}/p/${SHORT_ID}/`, origin)).toBe(
      PLAN_ID,
    );
  });

  it('ignores other hosts, schemes, credentials and paths', () => {
    for (const url of [
      `https://app.eimir.de.evil.example/p/${SHORT_ID}`,
      `http://app.eimir.de/p/${SHORT_ID}`,
      `https://user:secret@app.eimir.de/p/${SHORT_ID}`,
      `https://app.eimir.de/p/${SHORT_ID}/extra`,
      `https://app.eimir.de/plan/plans/${PLAN_ID}`,
      'https://app.eimir.de/auth/magic-link?token=synthetic',
      'de.eimir.app://calendar/google?calendarGoogle=connected',
      'not a url',
    ])
      expect(readPlanShortLinkUrl(url, origin)).toBeNull();
  });
});
