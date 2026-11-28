import { describe, expect, it } from 'vitest';
import { WirDesignId } from '../api/generated/models/WirDesignId';
import { APP_DESIGNS } from '../design/appDesigns.generated';
import {
  DEFAULT_WIR_DESIGN,
  isFreeWirDesign,
  WIR_DESIGNS,
  wirDesignLayout,
} from './wirDesign';

describe('design token files and stored Wir designs (#1907 C1)', () => {
  it('registers only stored design ids with the tier the client gates', () => {
    expect([...WIR_DESIGNS].sort()).toEqual(Object.values(WirDesignId).sort());
    expect(Object.keys(APP_DESIGNS).sort()).toEqual([...WIR_DESIGNS].sort());
    for (const [id, design] of Object.entries(APP_DESIGNS)) {
      expect(Object.values(WirDesignId)).toContain(id);
      expect(isFreeWirDesign(id as WirDesignId)).toBe(design.tier === 'free');
    }
  });

  it('shares the default design', () => {
    expect(DEFAULT_WIR_DESIGN).toBe(WirDesignId.connected);
  });

  it('maps migrated designs to their layout mode', () => {
    expect(wirDesignLayout(WirDesignId.connected)).toBe('connected');
    expect(wirDesignLayout(WirDesignId.warm)).toBe('open');
    expect(wirDesignLayout(WirDesignId.modern)).toBe('compact');
    expect(wirDesignLayout(WirDesignId.classic)).toBe('classic');
    expect(wirDesignLayout(WirDesignId.quiet_together)).toBe('names');
  });
});
