import type { Page } from '@playwright/test';

type Metrics = {
  created: number;
  revoked: number;
  active: number;
  peak: number;
};
type MetricsWindow = Window & { mediaOwnershipMetrics: () => Metrics };

/** Counts only; no URLs or media content leave the synthetic browser fixture. */
export async function installMediaOwnershipMetrics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    const owned = new Set<string>();
    let created = 0;
    let revoked = 0;
    let peak = 0;
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      owned.add(url);
      created += 1;
      peak = Math.max(peak, owned.size);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      if (owned.delete(url)) revoked += 1;
      revoke(url);
    };
    (window as MetricsWindow).mediaOwnershipMetrics = () => ({
      created,
      revoked,
      active: owned.size,
      peak,
    });
  });
}

export async function mediaOwnershipMetrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => (window as MetricsWindow).mediaOwnershipMetrics());
}
