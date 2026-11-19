/*
 * Measures the three sheet variants in Chromium with 4x CPU throttling and
 * writes results/results.json and results/summary.md. Run `npm run measure`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const here = import.meta.dirname;
const VARIANTS = (process.env.VARIANTS ?? 'current,waapi,motion').split(',');
const ONLY_SCENARIOS = process.env.SCENARIOS?.split(',');
const LOADS = [0, 24];
const REPEAT = Number(process.env.REPEAT ?? 5);
const CPU_THROTTLE = 4;
const VIEWPORT = { width: 390, height: 844 };
const HANDLE = { x: 195, y: 360 };
const TRACE_CATEGORIES = [
  'blink.user_timing',
  'benchmark',
  'cc',
  'viz',
  'disabled-by-default-devtools.timeline.frame',
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Pointer scripts. Each returns the pointer travel of a regrab, if any. */
const SCENARIOS = {
  // A short, fast flick: below the 120 px distance threshold.
  fling: async (mouse) => {
    await mouse.down();
    for (let i = 1; i <= 6; i += 1)
      await mouse.move(HANDLE.x, HANDLE.y + i * 16);
    await mouse.up();
  },
  // A deliberate pull past the distance threshold.
  dismiss: async (mouse) => {
    await mouse.down();
    for (let i = 1; i <= 22; i += 1) {
      await mouse.move(HANDLE.x, HANDLE.y + i * 10);
      await sleep(16);
    }
    await mouse.up();
  },
  // A slow pull that stops, then lets go: the sheet returns.
  cancel: async (mouse) => {
    await mouse.down();
    for (let i = 1; i <= 16; i += 1) {
      await mouse.move(HANDLE.x, HANDLE.y + i * 5);
      await sleep(25);
    }
    await sleep(150);
    await mouse.up();
  },
  // Let go mid-pull and grab the returning sheet again.
  interrupt: async (mouse, page) => {
    await mouse.down();
    for (let i = 1; i <= 16; i += 1) {
      await mouse.move(HANDLE.x, HANDLE.y + i * 5);
      await sleep(16);
    }
    await sleep(120);
    await mouse.up();
    await sleep(60);
    const y = HANDLE.y + 80;
    await mouse.move(HANDLE.x, y);
    await page.evaluate(() => {
      window.__grab = null;
    });
    await mouse.down();
    await mouse.move(HANDLE.x, y + 10);
    await mouse.move(HANDLE.x, y + 20);
    await sleep(100);
    await mouse.up();
    return 20;
  },
};

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const median = (values) => percentile(values.filter((v) => v !== null), 50);

function slope(samples) {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (last.t - first.t < 8) return null;
  return (last.y - first.y) / (last.t - first.t);
}

/** Ground truth: pointer travel in the 100 ms before the first pointerup. */
function fingerVelocity(pointer) {
  const upIndex = pointer.findIndex((p) => p.type === 'pointerup');
  if (upIndex < 1) return null;
  const up = pointer[upIndex];
  const moves = pointer.slice(0, upIndex).filter((p) => p.t >= up.t - 100);
  if (!moves.length) return 0;
  const lastY = pointer[upIndex - 1].y;
  return (lastY - moves[0].y) / Math.max(1, up.t - moves[0].t);
}

function frameStats(trace, startName = 'gt-release', endName = 'gt-settled') {
  if (!trace) return null;
  const events = JSON.parse(trace).traceEvents ?? [];
  const markTs = (name) =>
    events.filter((e) => e.name === name).map((e) => e.ts).pop();
  const start = markTs(startName);
  const end = markTs(endName);
  if (start === undefined || end === undefined) return null;
  // Frames the display compositor actually drew and swapped to the screen.
  const draws = events
    .filter(
      (e) => e.name === 'Display::DrawAndSwap' && e.ts >= start && e.ts <= end,
    )
    .map((e) => e.ts)
    .sort((a, b) => a - b);
  const gaps = draws.slice(1).map((ts, i) => (ts - draws[i]) / 1000);
  const durationMs = (end - start) / 1000;
  const expected = Math.max(1, Math.round(durationMs / (1000 / 60)));
  return {
    presented: draws.length,
    expected,
    dropped: Math.max(0, expected - draws.length),
    maxGapMs: gaps.length ? Math.max(...gaps) : null,
    p95GapMs: percentile(gaps, 95),
  };
}

async function runOnce(browser, origin, variant, scenario, load, reduced) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__grab = null;
    window.__pointer = [];
    window.__lag = [];
    let downY = null;
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (downY === null) {
          downY = event.clientY;
          performance.mark('gt-down');
        }
      },
      true,
    );
    window.addEventListener('pointerup', () => {
      downY = null;
    });
    window.addEventListener('pointermove', (event) => {
      if (downY === null) return;
      const delta = event.clientY - downY;
      if (delta < 8) return;
      requestAnimationFrame(() => {
        const sheet = document.querySelector('[data-sheet]');
        if (!sheet || downY === null) return;
        const offset =
          sheet.getBoundingClientRect().top - window.innerHeight * 0.4;
        window.__lag.push(Math.abs(offset - delta));
      });
    });
    for (const type of ['pointerdown', 'pointermove', 'pointerup'])
      window.addEventListener(
        type,
        (event) => {
          window.__pointer.push({ type, t: event.timeStamp, y: event.clientY });
        },
        true,
      );
    const offset = () => {
      const sheet = document.querySelector('[data-sheet]');
      return sheet
        ? sheet.getBoundingClientRect().top - window.innerHeight * 0.4
        : 0;
    };
    window.addEventListener(
      'pointerdown',
      () => {
        if (window.__grab === null) window.__grab = { atDown: offset() };
      },
      true,
    );
    window.addEventListener('pointermove', () => {
      const grab = window.__grab;
      if (!grab || grab.afterMoves) return;
      grab.moves = (grab.moves ?? 0) + 1;
      if (grab.moves === 2)
        requestAnimationFrame(() => {
          grab.afterMoves = offset();
        });
    });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  await page.goto(`${origin}/${variant}.html?load=${load}`);
  await page.waitForFunction(() => window.__probe?.ready === true);
  await sleep(300);
  await page.mouse.move(HANDLE.x, HANDLE.y);
  const traced = scenario === 'fling' || scenario === 'dismiss';
  if (traced)
    await browser.startTracing(page, { categories: TRACE_CATEGORIES });
  const regrabTravel = await SCENARIOS[scenario](page.mouse, page);
  await page
    .waitForFunction(
      () => window.__probe.marks.filter((m) => m.name === 'settled').length > 0,
      null,
      { timeout: 4000 },
    )
    .catch(() => {});
  await sleep(200);
  const trace = traced ? (await browser.stopTracing()).toString() : null;
  const data = await page.evaluate(() => ({
    samples: window.__probe.samples,
    marks: window.__probe.marks,
    grab: window.__grab,
    pointer: window.__pointer,
    lag: window.__lag,
  }));
  await context.close();

  const release = data.marks.find((m) => m.name === 'release');
  const settled = data.marks.find((m) => m.name === 'settled');
  const result = { variant, scenario, load, reduced };
  if (!release) return { ...result, error: 'no release' };
  result.dismiss = release.dismiss;
  result.fingerVelocity = fingerVelocity(data.pointer);
  result.releaseVelocity = release.velocity;
  if (settled) {
    result.settleMs = settled.t - release.t;
    result.styleWritesDuringSettle = settled.styleWrites - release.styleWrites;
    const during = data.samples.filter(
      (s) => s.t >= release.t && s.t <= settled.t,
    );
    const intervals = during.slice(1).map((s, i) => s.t - during[i].t);
    result.mainFrameP95Ms = percentile(intervals, 95);
    result.mainFrameMaxMs = intervals.length ? Math.max(...intervals) : null;
  }
  // Rendered sheet velocity in the 100 ms before and after release.
  const before = data.samples.filter(
    (s) => s.t <= release.t && s.t >= release.t - 100,
  );
  const after = data.samples.filter(
    (s) => s.t >= release.t && s.t <= release.t + 100,
  );
  // Time from release until the sheet visibly moves (more than 1 px).
  const atRelease = before.length ? before[before.length - 1].y : null;
  const moved = data.samples.find(
    (s) => s.t > release.t && atRelease !== null && Math.abs(s.y - atRelease) > 1,
  );
  result.startLatencyMs = moved ? moved.t - release.t : null;
  result.velocityBefore = slope(before);
  result.velocityAfter = slope(after);
  if (regrabTravel !== undefined && data.grab?.afterMoves !== undefined)
    result.grabJumpPx = Math.abs(
      data.grab.afterMoves - data.grab.atDown - regrabTravel,
    );
  if (traced) {
    result.frames = frameStats(trace);
    result.trackFrames = frameStats(trace, 'gt-down', 'gt-release');
  }
  result.trackLagPx = data.lag.length ? percentile(data.lag, 95) : null;
  return result;
}

function bundleSizes() {
  const dist = resolve(here, 'dist');
  const manifest = JSON.parse(
    readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'),
  );
  const gzip = (file) => gzipSync(readFileSync(resolve(dist, file))).length;
  const walk = (key, seen, dynamic) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return;
    seen.add(key);
    for (const next of chunk.imports ?? []) walk(next, seen, dynamic);
    for (const next of chunk.dynamicImports ?? []) dynamic.add(next);
  };
  const sizes = {};
  for (const name of ['baseline', ...VARIANTS]) {
    const seen = new Set();
    const dynamic = new Set();
    walk(`${name}.html`, seen, dynamic);
    const lazy = new Set();
    for (const key of dynamic) walk(key, lazy, new Set());
    for (const key of seen) lazy.delete(key);
    const sum = (keys) =>
      [...keys].reduce((total, key) => total + gzip(manifest[key].file), 0);
    sizes[name] = { initial: sum(seen), lazy: sum(lazy) };
  }
  for (const name of VARIANTS) {
    sizes[name].initialDelta = sizes[name].initial - sizes.baseline.initial;
    sizes[name].totalDelta =
      sizes[name].initialDelta + sizes[name].lazy - sizes.baseline.lazy;
  }
  return sizes;
}

function codeLines(files) {
  let total = 0;
  for (const file of files) {
    let inComment = false;
    for (const raw of readFileSync(resolve(here, file), 'utf8').split('\n')) {
      const line = raw.trim();
      if (inComment) {
        if (line.includes('*/')) inComment = false;
        continue;
      }
      if (!line || line.startsWith('//')) continue;
      if (line.startsWith('/*')) {
        if (!line.includes('*/')) inComment = true;
        continue;
      }
      total += 1;
    }
  }
  return total;
}

const fmt = (value, digits = 0) =>
  value === null || value === undefined || Number.isNaN(value)
    ? 'n/a'
    : Number(value).toFixed(digits);

async function main() {
  const server = await preview({
    root: here,
    preview: { port: 4179, strictPort: true },
    logLevel: 'error',
  });
  const origin = 'http://localhost:4179';
  const browser = await chromium.launch();
  const browserVersion = browser.version();
  const runs = [];
  const combos = [];
  for (const variant of VARIANTS) {
    for (const load of LOADS)
      for (const scenario of Object.keys(SCENARIOS).filter(
        (name) => !ONLY_SCENARIOS || ONLY_SCENARIOS.includes(name),
      ))
        combos.push({ variant, scenario, load, reduced: false });
    if (!ONLY_SCENARIOS) {
      combos.push({ variant, scenario: 'dismiss', load: 0, reduced: true });
      combos.push({ variant, scenario: 'interrupt', load: 0, reduced: true });
    }
  }
  for (const combo of combos)
    for (let i = 0; i < REPEAT; i += 1) {
      const run = await runOnce(
        browser,
        origin,
        combo.variant,
        combo.scenario,
        combo.load,
        combo.reduced,
      );
      runs.push(run);
      process.stdout.write('.');
    }
  await browser.close();
  await server.close();

  const sizes = bundleSizes();
  const lines = {
    shared: codeLines(['src/gesture.ts']),
    current: codeLines(['src/CurrentSheet.tsx']),
    waapi: codeLines(['src/WaapiSheet.tsx', 'src/spring.ts']),
    motion: codeLines(['src/MotionSheet.tsx', 'src/motionFeatures.ts']),
  };

  const groups = combos.map((combo) => {
    const matching = runs.filter(
      (r) =>
        r.variant === combo.variant &&
        r.scenario === combo.scenario &&
        r.load === combo.load &&
        r.reduced === combo.reduced,
    );
    const pick = (fn) => median(matching.map(fn));
    return {
      ...combo,
      runs: matching.length,
      errors: matching.filter((r) => r.error).length,
      dismissRate: matching.filter((r) => r.dismiss).length / matching.length,
      settleMs: pick((r) => r.settleMs ?? null),
      mainFrameP95Ms: pick((r) => r.mainFrameP95Ms ?? null),
      mainFrameMaxMs: pick((r) => r.mainFrameMaxMs ?? null),
      styleWrites: pick((r) => r.styleWritesDuringSettle ?? null),
      velocityBefore: pick((r) => r.velocityBefore ?? null),
      velocityAfter: pick((r) => r.velocityAfter ?? null),
      grabJumpPx: pick((r) => r.grabJumpPx ?? null),
      presented: pick((r) => r.frames?.presented ?? null),
      dropped: pick((r) => r.frames?.dropped ?? null),
      maxGapMs: pick((r) => r.frames?.maxGapMs ?? null),
      p95GapMs: pick((r) => r.frames?.p95GapMs ?? null),
      releaseVelocity: pick((r) => r.releaseVelocity ?? null),
      fingerVelocity: pick((r) => r.fingerVelocity ?? null),
      trackLagPx: pick((r) => r.trackLagPx ?? null),
      startLatencyMs: pick((r) => r.startLatencyMs ?? null),
      trackMaxGapMs: pick((r) => r.trackFrames?.maxGapMs ?? null),
      expected: pick((r) => r.frames?.expected ?? null),
    };
  });

  mkdirSync(resolve(here, 'results'), { recursive: true });
  const meta = {
    date: new Date().toISOString(),
    browser: `Chromium ${browserVersion} (Playwright, headless)`,
    cpuThrottle: CPU_THROTTLE,
    viewport: VIEWPORT,
    repeat: REPEAT,
  };
  writeFileSync(
    resolve(here, 'results/results.json'),
    `${JSON.stringify({ meta, sizes, lines, groups, runs }, null, 2)}\n`,
  );

  const table = [
    '| Variant | Scenario | Load ms/frame | Reduced | Dismissed | Settle ms | Frames drawn / expected | Drawn-frame gap p95 / max ms | Main-thread frame p95 / max ms | Style writes during settle | Finger velocity (measured) / estimated by variant / sheet before / after release px/ms | Regrab jump px |',
    '| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: |',
    ...groups.map(
      (g) =>
        `| ${g.variant} | ${g.scenario} | ${g.load} | ${g.reduced ? 'yes' : 'no'} | ${Math.round(g.dismissRate * 100)} % | ${fmt(g.settleMs)} | ${fmt(g.presented)} / ${fmt(g.expected)} | ${fmt(g.p95GapMs, 1)} / ${fmt(g.maxGapMs, 1)} | ${fmt(g.mainFrameP95Ms, 1)} / ${fmt(g.mainFrameMaxMs, 1)} | ${fmt(g.styleWrites)} | ${fmt(g.fingerVelocity, 2)} / ${fmt(g.releaseVelocity, 2)} / ${fmt(g.velocityBefore, 2)} / ${fmt(g.velocityAfter, 2)} | ${fmt(g.grabJumpPx, 1)} | ${fmt(g.trackLagPx, 1)} | ${fmt(g.trackMaxGapMs, 1)} | ${fmt(g.startLatencyMs, 1)} |`,
    ),
  ].join('\n');
  const sizeTable = [
    '| Variant | Initial JS gzip | Lazy JS gzip | Initial delta vs baseline | Total delta vs baseline | Gesture code lines |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| baseline | ${sizes.baseline.initial} B | ${sizes.baseline.lazy} B | — | — | — |`,
    ...VARIANTS.map(
      (v) =>
        `| ${v} | ${sizes[v].initial} B | ${sizes[v].lazy} B | ${sizes[v].initialDelta} B | ${sizes[v].totalDelta} B | ${lines[v]} (+ ${lines.shared} shared) |`,
    ),
  ].join('\n');
  writeFileSync(
    resolve(here, 'results/summary.md'),
    `# Gesture test results\n\n${meta.browser}, ${CPU_THROTTLE}x CPU throttling, ${VIEWPORT.width}x${VIEWPORT.height}, median of ${REPEAT} runs, ${meta.date}.\n\n${table}\n\n${sizeTable}\n`,
  );
  console.log('\n', readFileSync(resolve(here, 'results/summary.md'), 'utf8'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
